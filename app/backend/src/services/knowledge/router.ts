import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../../db/index.js';
import { requireAuth } from '../../middleware/auth.js';
import { createSSEStream } from '../../lib/sse.js';
import { ok, badRequest, notFound } from '../../lib/response.js';
import { embedText, answerQuestion } from '../../ai/index.js';

const router = Router();
router.use(requireAuth);

const IndexDocSchema = z.object({
  title: z.string().min(1).max(500),
  content: z.string().min(1),
  entryType: z.enum(['document', 'feedback_summary', 'onboarding', 'custom']).default('document'),
  sourceId: z.string().uuid().optional(),
  sourceType: z.string().max(100).optional(),
  productAreaId: z.string().uuid().optional(),
  metadata: z.record(z.unknown()).default({}),
});

const QaSchema = z.object({
  question: z.string().min(1).max(2000),
  productAreaId: z.string().uuid().optional(),
});

const SearchSchema = z.object({
  query: z.string().min(1).max(500),
  productAreaId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(20).default(5),
});

// ─── GET /search — semantic search ───────────────────────────────────────────

router.get('/search', async (req: Request, res: Response) => {
  const parsed = SearchSchema.safeParse(req.query);
  if (!parsed.success) {
    badRequest(res, parsed.error.issues.map((i) => i.message).join('; '));
    return;
  }

  const { query: searchQuery, productAreaId, limit } = parsed.data;
  const tenantId = req.user!.tenantId;

  let embedding: number[];
  try {
    // TODO: call AG-06 embeddings via orchestration layer
    embedding = await embedText(searchQuery);
  } catch {
    // Fallback to text search when embeddings are unavailable (stub mode)
    const conditions = ['tenant_id = $1', "to_tsvector('english', content) @@ plainto_tsquery('english', $2)"];
    const params: unknown[] = [tenantId, searchQuery];

    if (productAreaId) {
      conditions.push('product_area_id = $3');
      params.push(productAreaId);
    }

    const result = await query(
      `SELECT id, title, content, entry_type, source_id, source_type, metadata, created_at
       FROM knowledge_entries
       WHERE ${conditions.join(' AND ')}
       LIMIT $${params.length + 1}`,
      [...params, limit]
    );

    ok(res, { results: result.rows, searchMode: 'text_fallback' });
    return;
  }

  const conditions: string[] = ['tenant_id = $1'];
  const params: unknown[] = [tenantId];
  let paramIdx = 2;

  if (productAreaId) {
    conditions.push(`product_area_id = $${paramIdx++}`);
    params.push(productAreaId);
  }

  // pgvector cosine distance — lower is more similar
  const result = await query(
    `SELECT id, title, content, entry_type, source_id, source_type, metadata, created_at,
            1 - (embedding <=> $${paramIdx}::vector) as similarity
     FROM knowledge_entries
     WHERE ${conditions.join(' AND ')}
     ORDER BY embedding <=> $${paramIdx}::vector
     LIMIT $${paramIdx + 1}`,
    [...params, JSON.stringify(embedding), limit]
  );

  ok(res, { results: result.rows, searchMode: 'vector' });
});

// ─── POST /index — index a document into KB ───────────────────────────────────

router.post('/index', async (req: Request, res: Response) => {
  const parsed = IndexDocSchema.safeParse(req.body);
  if (!parsed.success) {
    badRequest(res, parsed.error.issues.map((i) => i.message).join('; '));
    return;
  }

  const { title, content, entryType, sourceId, sourceType, productAreaId, metadata } = parsed.data;
  const tenantId = req.user!.tenantId;
  const id = uuidv4();

  let embedding: number[] | null = null;
  try {
    // TODO: call AG-06 embeddings via orchestration layer
    embedding = await embedText(content);
  } catch {
    // Index without embedding — text search still works
  }

  await query(
    `INSERT INTO knowledge_entries
       (id, tenant_id, product_area_id, title, content, entry_type, source_id, source_type, embedding, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::vector, $10)`,
    [
      id,
      tenantId,
      productAreaId ?? null,
      title,
      content,
      entryType,
      sourceId ?? null,
      sourceType ?? null,
      embedding ? JSON.stringify(embedding) : null,
      JSON.stringify(metadata),
    ]
  );

  ok(res, {
    id,
    title,
    embeddingIndexed: embedding !== null,
    message: embedding ? 'Indexed with vector embedding' : 'Indexed (text only — embeddings unavailable)',
  }, 201);
});

// ─── POST /sync-documents — index all workspace documents into KB ─────────────

router.post('/sync-documents', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId;
  const { productAreaId } = req.body as { productAreaId?: string };

  const conditions = ['d.tenant_id = $1', "d.sections IS NOT NULL", "d.sections != '{}'"];
  const params: unknown[] = [tenantId];
  if (productAreaId) { conditions.push('d.product_area_id = $2'); params.push(productAreaId); }

  const docs = await query(
    `SELECT d.id, d.title, d.type, d.sections FROM documents d WHERE ${conditions.join(' AND ')} ORDER BY d.updated_at DESC LIMIT 100`,
    params
  );

  let indexed = 0;
  let skipped = 0;

  for (const doc of docs.rows as Record<string, unknown>[]) {
    const secs = typeof doc.sections === 'string'
      ? (() => { try { return JSON.parse(doc.sections as string); } catch { return {}; } })()
      : (doc.sections ?? {});
    const content: string = (secs as Record<string, unknown>).content as string ?? '';
    if (!content || content.length < 10) { skipped++; continue; }

    // Upsert: delete existing entry for this source doc, then re-insert
    await query('DELETE FROM knowledge_entries WHERE tenant_id = $1 AND source_id = $2 AND source_type = $3', [tenantId, doc.id, 'documents']);
    await query(
      `INSERT INTO knowledge_entries (id, tenant_id, product_area_id, title, content, entry_type, source_id, source_type, metadata)
       VALUES ($1,$2,$3,$4,$5,'document',$6,'documents',$7)`,
      [uuidv4(), tenantId, productAreaId ?? null, doc.title, content.slice(0, 8000), doc.id, JSON.stringify({ doc_type: doc.type, synced_at: new Date().toISOString() })]
    );
    indexed++;
  }

  ok(res, { indexed, skipped, total: docs.rows.length, message: `${indexed} document(s) synced to Knowledge Base.` });
});

// ─── POST /qa — onboarding Q&A → SSE stream ──────────────────────────────────

router.post('/qa', async (req: Request, res: Response) => {
  const parsed = QaSchema.safeParse(req.body);
  if (!parsed.success) {
    badRequest(res, parsed.error.issues.map((i) => i.message).join('; '));
    return;
  }

  const { question } = parsed.data;
  const tenantId = req.user!.tenantId;
  const stream = createSSEStream(res);

  try {
    // TODO: call AG-06 via orchestration layer
    await answerQuestion(question, tenantId, (chunk) => stream.write(chunk));
  } catch (err) {
    stream.error((err as Error).message ?? 'Q&A failed', 'AI_ERROR');
    return;
  }

  stream.end();
});

export default router;
