import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import { query, withTransaction } from '../../db/index.js';
import { requireAuth } from '../../middleware/auth.js';
import { createSSEStream } from '../../lib/sse.js';
import { ok, badRequest, notFound, fail } from '../../lib/response.js';
import { generateDocument, regenerateSection, documentAssistant } from '../../ai/index.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowedExts = ['.pdf', '.docx', '.doc', '.txt', '.md', '.csv', '.xlsx', '.pptx'];
    const ext = '.' + (file.originalname.split('.').pop() ?? '').toLowerCase();
    cb(null, allowedExts.includes(ext));
  },
});

const router = Router();
router.use(requireAuth);

// ─── Schemas ──────────────────────────────────────────────────────────────────

const CreateDocSchema = z.object({
  title: z.string().min(1).max(500),
  type: z.enum(['PRD', 'UserStory', 'AcceptanceCriteria']),
  productAreaId: z.string().uuid().optional(),
  context: z.record(z.unknown()).default({}),
});

const UpdateDocSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  status: z.enum(['draft', 'in_review', 'approved', 'archived']).optional(),
  sections: z.record(z.unknown()).optional(),
});

const RegenerateSectionSchema = z.object({
  sectionKey: z.string().min(1),
  context: z.record(z.unknown()).default({}),
});

// ─── GET / — list documents ───────────────────────────────────────────────────

router.get('/', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId;
  const { type, status, productAreaId, page = '1', limit = '20' } = req.query as Record<string, string>;

  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
  const offset = (pageNum - 1) * limitNum;

  const conditions: string[] = ['d.tenant_id = $1'];
  const params: unknown[] = [tenantId];
  let paramIdx = 2;

  if (type) { conditions.push(`d.type = $${paramIdx++}`); params.push(type); }
  if (status) { conditions.push(`d.status = $${paramIdx++}`); params.push(status); }
  if (productAreaId) { conditions.push(`(d.product_area_id = $${paramIdx++} OR d.product_area_id IS NULL)`); params.push(productAreaId); }

  const where = conditions.join(' AND ');

  const [rows, countRows] = await Promise.all([
    query(
      `SELECT d.id, d.title, d.type, d.status, d.product_area_id,
              d.created_by, d.created_at, d.updated_at, d.sections,
              u.full_name as created_by_name
       FROM documents d
       LEFT JOIN users u ON u.id = d.created_by
       WHERE ${where}
       ORDER BY d.updated_at DESC
       LIMIT $${paramIdx++} OFFSET $${paramIdx}`,
      [...params, limitNum, offset]
    ),
    query(`SELECT COUNT(*) as total FROM documents d WHERE ${where}`, params),
  ]);

  const documents = rows.rows.map((d: Record<string, unknown>) => ({
    ...d,
    sections: typeof d.sections === 'string' ? (() => { try { return JSON.parse(d.sections as string); } catch { return null; } })() : (d.sections ?? null),
  }));

  ok(res, {
    documents,
    pagination: { page: pageNum, limit: limitNum, total: parseInt(countRows.rows[0].total as string, 10) },
  });
});

// ─── POST / — create document + stream generation ────────────────────────────

router.post('/', async (req: Request, res: Response) => {
  const parsed = CreateDocSchema.safeParse(req.body);
  if (!parsed.success) {
    badRequest(res, parsed.error.issues.map((i) => i.message).join('; '));
    return;
  }

  const { title, type, productAreaId, context } = parsed.data;
  const docId = uuidv4();
  const tenantId = req.user!.tenantId;

  // Persist the document stub first
  await query(
    `INSERT INTO documents (id, tenant_id, product_area_id, created_by, title, type, sections)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [docId, tenantId, productAreaId ?? null, req.user!.id, title, type, JSON.stringify({})]
  );

  // Stream AI generation
  const stream = createSSEStream(res);
  stream.writeEvent('meta', { documentId: docId, title, type });

  try {
    // TODO: call AG-02 via orchestration layer
    await generateDocument(
      { type, context: { ...context, title, tenantId }, tenantId, productAreaId },
      (chunk) => stream.write(chunk)
    );
  } catch (err) {
    stream.error((err as Error).message ?? 'Document generation failed', 'AI_ERROR');
    return;
  }

  stream.end();
});

// ─── GET /:id ─────────────────────────────────────────────────────────────────

router.get('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const tenantId = req.user!.tenantId;

  const result = await query(
    `SELECT d.*, u.full_name as created_by_name
     FROM documents d
     LEFT JOIN users u ON u.id = d.created_by
     WHERE d.id = $1 AND d.tenant_id = $2 LIMIT 1`,
    [id, tenantId]
  );

  if (!result.rows[0]) { notFound(res, 'Document not found'); return; }

  ok(res, result.rows[0]);
});

// ─── DELETE /:id ─────────────────────────────────────────────────────────────

router.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const tenantId = req.user!.tenantId;

  const existing = await query(
    'SELECT id FROM documents WHERE id = $1 AND tenant_id = $2 LIMIT 1',
    [id, tenantId]
  );
  if (!existing.rows[0]) { notFound(res, 'Document not found'); return; }

  // Remove versions first (FK), then the document
  await query('DELETE FROM document_versions WHERE document_id = $1', [id]);
  await query('DELETE FROM documents WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
  ok(res, { deleted: true });
});

// ─── PUT /:id — update (inline edits) ────────────────────────────────────────

router.put('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const tenantId = req.user!.tenantId;

  const parsed = UpdateDocSchema.safeParse(req.body);
  if (!parsed.success) {
    badRequest(res, parsed.error.issues.map((i) => i.message).join('; '));
    return;
  }

  const existing = await query(
    'SELECT id, sections FROM documents WHERE id = $1 AND tenant_id = $2 LIMIT 1',
    [id, tenantId]
  );
  if (!existing.rows[0]) { notFound(res, 'Document not found'); return; }

  await withTransaction(async (client) => {
    const { title, status, sections } = parsed.data;

    // Save a version snapshot before update
    const versionResult = await client.query(
      'SELECT COALESCE(MAX(version), 0) + 1 as next FROM document_versions WHERE document_id = $1',
      [id]
    );
    await client.query(
      `INSERT INTO document_versions (id, document_id, tenant_id, version, sections, changed_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [uuidv4(), id, tenantId, versionResult.rows[0].next, existing.rows[0].sections, req.user!.id]
    );

    const setClauses: string[] = ['updated_at = NOW()'];
    const setParams: unknown[] = [];
    let idx = 1;

    if (title !== undefined) { setClauses.push(`title = $${idx++}`); setParams.push(title); }
    if (status !== undefined) { setClauses.push(`status = $${idx++}`); setParams.push(status); }
    if (sections !== undefined) { setClauses.push(`sections = $${idx++}`); setParams.push(JSON.stringify(sections)); }

    setParams.push(id, tenantId);
    await client.query(
      `UPDATE documents SET ${setClauses.join(', ')} WHERE id = $${idx++} AND tenant_id = $${idx}`,
      setParams
    );
  });

  const updated = await query(
    'SELECT * FROM documents WHERE id = $1 AND tenant_id = $2 LIMIT 1',
    [id, tenantId]
  );
  ok(res, updated.rows[0]);
});

// ─── POST /:id/regenerate-section — stream section regen ─────────────────────

router.post('/:id/regenerate-section', async (req: Request, res: Response) => {
  const { id } = req.params as Record<string, string>;
  const tenantId = req.user!.tenantId;

  const parsed = RegenerateSectionSchema.safeParse(req.body);
  if (!parsed.success) {
    badRequest(res, parsed.error.issues.map((i) => i.message).join('; '));
    return;
  }

  const existing = await query(
    'SELECT id, type FROM documents WHERE id = $1 AND tenant_id = $2 LIMIT 1',
    [id, tenantId]
  );
  if (!existing.rows[0]) { notFound(res, 'Document not found'); return; }

  const stream = createSSEStream(res);
  stream.writeEvent('meta', { documentId: id, sectionKey: parsed.data.sectionKey });

  try {
    // TODO: call AG-02 (section mode) via orchestration layer
    await regenerateSection(id, parsed.data.sectionKey, parsed.data.context, (chunk) => stream.write(chunk));
  } catch (err) {
    stream.error((err as Error).message ?? 'Section regeneration failed', 'AI_ERROR');
    return;
  }

  stream.end();
});

// ─── GET /:id/versions — list version history ─────────────────────────────────

router.get('/:id/versions', async (req: Request, res: Response) => {
  const { id } = req.params;
  const tenantId = req.user!.tenantId;
  const existing = await query('SELECT id FROM documents WHERE id = $1 AND tenant_id = $2 LIMIT 1', [id, tenantId]);
  if (!existing.rows[0]) { notFound(res, 'Document not found'); return; }
  const result = await query(
    'SELECT id, version, sections, changed_by, created_at FROM document_versions WHERE document_id = $1 ORDER BY version DESC',
    [id]
  );
  ok(res, { versions: result.rows });
});

// ─── POST /:id/restore/:versionId — restore a prior version ──────────────────

router.post('/:id/restore/:versionId', async (req: Request, res: Response) => {
  const { id, versionId } = req.params;
  const tenantId = req.user!.tenantId;
  const existing = await query('SELECT id, sections FROM documents WHERE id = $1 AND tenant_id = $2 LIMIT 1', [id, tenantId]);
  if (!existing.rows[0]) { notFound(res, 'Document not found'); return; }
  const ver = await query('SELECT sections FROM document_versions WHERE id = $1 AND document_id = $2 LIMIT 1', [versionId, id]);
  if (!ver.rows[0]) { notFound(res, 'Version not found'); return; }

  // Save current as a new version before restoring
  const versionResult = await query(
    'SELECT COALESCE(MAX(version), 0) + 1 as next FROM document_versions WHERE document_id = $1',
    [id]
  );
  await query(
    'INSERT INTO document_versions (id, document_id, tenant_id, version, sections, changed_by) VALUES ($1,$2,$3,$4,$5,$6)',
    [uuidv4(), id, tenantId, versionResult.rows[0].next, existing.rows[0].sections, req.user!.id]
  );
  await query('UPDATE documents SET sections = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3', [ver.rows[0].sections, id, tenantId]);
  const updated = await query('SELECT * FROM documents WHERE id = $1 AND tenant_id = $2 LIMIT 1', [id, tenantId]);
  ok(res, updated.rows[0]);
});

// ─── GET /:id/stream — SSE for document generation status ─────────────────────

router.get('/:id/stream', async (req: Request, res: Response) => {
  const { id } = req.params;
  const tenantId = req.user!.tenantId;

  const existing = await query(
    'SELECT id, status FROM documents WHERE id = $1 AND tenant_id = $2 LIMIT 1',
    [id, tenantId]
  );
  if (!existing.rows[0]) {
    // Still open SSE so client doesn't hang, then send error event
    const stream = createSSEStream(res);
    stream.error('Document not found', 'NOT_FOUND');
    return;
  }

  const stream = createSSEStream(res);
  stream.writeEvent('status', { documentId: id, status: existing.rows[0].status });
  stream.end();
});

// ─── POST /upload — upload any document file ──────────────────────────────────

router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) { badRequest(res, 'No file provided'); return; }

  const tenantId = req.user!.tenantId;
  const originalName = req.file.originalname;
  const ext = originalName.split('.').pop()?.toLowerCase() ?? '';
  const rawText = req.file.buffer.toString('utf-8').replace(/[^\x20-\x7E\n\r\t]/g, ' ').slice(0, 50000);
  const docId = uuidv4();

  await query(
    `INSERT INTO documents (id, tenant_id, product_area_id, created_by, title, type, status, sections)
     VALUES ($1, $2, $3, $4, $5, $6, 'draft', $7)`,
    [
      docId,
      tenantId,
      req.body.productAreaId ?? null,
      req.user!.id,
      originalName,
      ext.toUpperCase() || 'UPLOAD',
      JSON.stringify({ content: rawText, fileName: originalName, fileSize: req.file.size, uploadedAt: new Date().toISOString() }),
    ]
  );

  ok(res, { id: docId, title: originalName, type: ext.toUpperCase() || 'UPLOAD', status: 'draft', sections: { content: rawText, fileName: originalName } });
});

// ─── POST /assistant — AI assistant (streaming) ───────────────────────────────

router.post('/assistant', async (req: Request, res: Response) => {
  const { command, documentId, uploadedFileIds } = req.body as {
    command: string;
    documentId?: string;
    uploadedFileIds?: string[];
  };

  if (!command?.trim()) { badRequest(res, 'command is required'); return; }

  const tenantId = req.user!.tenantId;

  // Fetch the target document if given
  let documentTitle: string | undefined;
  let documentContent: string | undefined;
  if (documentId) {
    const docRes = await query('SELECT title, sections FROM documents WHERE id = $1 AND tenant_id = $2 LIMIT 1', [documentId, tenantId]);
    if (docRes.rows[0]) {
      documentTitle = docRes.rows[0].title;
      const secs = typeof docRes.rows[0].sections === 'string' ? JSON.parse(docRes.rows[0].sections) : (docRes.rows[0].sections ?? {});
      documentContent = secs.content ?? '';
    }
  }

  // Fetch any referenced uploaded files
  const uploadedFiles: Array<{ name: string; content: string }> = [];
  if (uploadedFileIds?.length) {
    const placeholders = uploadedFileIds.map((_, i) => `$${i + 1}`).join(', ');
    const filesRes = await query(
      `SELECT title, sections FROM documents WHERE id IN (${placeholders}) AND tenant_id = $${uploadedFileIds.length + 1}`,
      [...uploadedFileIds, tenantId]
    );
    for (const row of filesRes.rows) {
      const secs = typeof row.sections === 'string' ? JSON.parse(row.sections) : (row.sections ?? {});
      uploadedFiles.push({ name: row.title, content: secs.content ?? '' });
    }
  }

  const stream = createSSEStream(res);
  let aiResult: { action?: string; updatedContent?: string; ticketData?: { title: string; description: string; type: string; points: number } } = {};

  try {
    aiResult = await documentAssistant(
      { command, documentTitle, documentContent, uploadedFiles },
      (chunk) => stream.write(chunk)
    );
  } catch (err) {
    stream.error((err as Error).message ?? 'Assistant error', 'AI_ERROR');
    return;
  }

  // If the assistant wants to create a sprint ticket, do it now
  let createdTicketId: string | undefined;
  if (aiResult.ticketData) {
    try {
      const { title, description, type, points } = aiResult.ticketData;
      const sprintRes = await query('SELECT id FROM sprints WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1', [tenantId]);
      let sprintId: string;
      if (sprintRes.rows[0]) {
        sprintId = sprintRes.rows[0].id as string;
      } else {
        sprintId = uuidv4();
        const today = new Date();
        const end = new Date(today); end.setDate(today.getDate() + 14);
        await query('INSERT INTO sprints (id, tenant_id, name, start_date, end_date) VALUES ($1,$2,$3,$4,$5)',
          [sprintId, tenantId, `Sprint ${today.toISOString().slice(0, 10)}`, today.toISOString().slice(0, 10), end.toISOString().slice(0, 10)]);
      }
      createdTicketId = uuidv4();
      await query(
        `INSERT INTO sprint_tickets (id, tenant_id, sprint_id, title, description, type, status, story_points, acceptance_criteria, needs_grooming)
         VALUES ($1,$2,$3,$4,$5,$6,'todo',$7,'[]',0)`,
        [createdTicketId, tenantId, sprintId, title, description, type, points]
      );
    } catch { /* non-fatal */ }
  }

  // If the assistant produced updated content, persist it
  if (documentId && aiResult.updatedContent) {
    try {
      const docRes = await query('SELECT sections FROM documents WHERE id = $1 AND tenant_id = $2 LIMIT 1', [documentId, tenantId]);
      if (docRes.rows[0]) {
        const existingSecs = typeof docRes.rows[0].sections === 'string' ? JSON.parse(docRes.rows[0].sections) : (docRes.rows[0].sections ?? {});
        await query('UPDATE documents SET sections = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3',
          [JSON.stringify({ ...existingSecs, content: aiResult.updatedContent }), documentId, tenantId]);
      }
    } catch { /* non-fatal */ }
  }

  stream.writeEvent('done', { updated: !!aiResult.updatedContent, documentId, createdTicketId });
  stream.end();
});

export default router;
