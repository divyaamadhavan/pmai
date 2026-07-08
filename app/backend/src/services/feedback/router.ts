import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import { parse as csvParse } from 'csv-parse/sync';
import { simpleParser, type ParsedMail } from 'mailparser';
import { query } from '../../db/index.js';
import { requireAuth } from '../../middleware/auth.js';
import { createSSEStream } from '../../lib/sse.js';
import { ok, fail, badRequest, notFound } from '../../lib/response.js';
import { analyseFeedback, buildPipelinePreview } from '../../ai/index.js';
import { runFeedbackPipeline } from './pipeline.js';

const ACCEPTED_EXTS = ['.eml', '.mbox', '.csv', '.txt', '.md', '.pdf', '.docx', '.doc'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = '.' + (file.originalname.split('.').pop() ?? '').toLowerCase();
    cb(null, ACCEPTED_EXTS.includes(ext));
  },
});

const router = Router();
router.use(requireAuth);

// ─── Schemas ──────────────────────────────────────────────────────────────────

const ListFeedbackSchema = z.object({
  channel: z.string().optional(),
  sentiment: z.enum(['positive', 'neutral', 'negative']).optional(),
  theme: z.string().uuid().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  productAreaId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const syncJobs = new Map<string, { status: string; progress: number; total: number }>();

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface NormalisedItem { body: string; author: string | null; receivedAt?: string; }

function cleanText(raw: string): string {
  return raw.replace(/[^\x20-\x7E\n\r\t]/g, ' ').replace(/\s{3,}/g, '\n\n').trim();
}

async function parseFileToItems(buffer: Buffer, ext: string, originalName: string): Promise<NormalisedItem[]> {
  const items: NormalisedItem[] = [];

  if (ext === '.eml') {
    const parsed: ParsedMail = await simpleParser(buffer);
    const body = parsed.text ?? (parsed.html ? parsed.html.replace(/<[^>]+>/g, ' ') : '');
    const from = parsed.from?.value?.[0];
    items.push({
      body: `Subject: ${parsed.subject ?? '(no subject)'}\n\n${body}`.trim(),
      author: from ? (from.name || from.address || null) : null,
      receivedAt: parsed.date?.toISOString(),
    });

  } else if (ext === '.mbox') {
    const fileContent = buffer.toString('utf-8');
    const messages = fileContent.split(/^From .+/m).filter((m) => m.trim().length > 0);
    const parsed = await Promise.all(messages.map((raw) => simpleParser(Buffer.from(raw))));
    for (const p of parsed) {
      if (!p.text && !p.html) continue;
      const body = p.text ?? (p.html ? p.html.replace(/<[^>]+>/g, ' ') : '');
      const from = p.from?.value?.[0];
      items.push({
        body: `Subject: ${p.subject ?? '(no subject)'}\n\n${body}`.trim(),
        author: from ? (from.name || from.address || null) : null,
        receivedAt: p.date?.toISOString(),
      });
    }

  } else if (ext === '.csv') {
    const text = buffer.toString('utf-8');
    let records: Record<string, string>[];
    try {
      records = csvParse(text, { columns: true, skip_empty_lines: true, trim: true }) as Record<string, string>[];
    } catch {
      // fallback: each line is a feedback item
      records = text.split('\n').filter((l) => l.trim()).slice(1).map((l) => ({ body: l }));
    }
    const bodyCol = records[0] ? Object.keys(records[0]).find((k) =>
      ['body', 'text', 'content', 'message', 'feedback', 'comment', 'review', 'description', 'notes'].includes(k.toLowerCase())
    ) ?? Object.keys(records[0])[0] : 'body';
    const authorCol = records[0] ? Object.keys(records[0]).find((k) =>
      ['author', 'name', 'user', 'customer', 'email', 'from'].includes(k.toLowerCase())
    ) : undefined;
    for (const row of records) {
      const body = cleanText(row[bodyCol] ?? '');
      if (body.length < 5) continue;
      items.push({ body, author: authorCol ? (row[authorCol] || null) : null });
    }

  } else if (ext === '.txt' || ext === '.md') {
    const text = cleanText(buffer.toString('utf-8'));
    const paragraphs = text.split(/\n\n+/).filter((p) => p.trim().length > 20);
    if (paragraphs.length <= 1) {
      // treat whole file as one item
      if (text.length > 5) items.push({ body: text, author: null });
    } else {
      for (const p of paragraphs) {
        items.push({ body: p.trim(), author: null });
      }
    }

  } else {
    // PDF, DOCX, DOC — best-effort UTF-8 extraction
    const rawText = cleanText(buffer.toString('utf-8').slice(0, 30000));
    if (rawText.length > 20) {
      items.push({ body: `[Extracted from ${originalName}]\n\n${rawText}`, author: null });
    }
  }

  return items.filter((i) => i.body.length > 0).slice(0, 500);
}

// ─── GET / — list feedback items ─────────────────────────────────────────────

router.get('/', async (req: Request, res: Response) => {
  const parsed = ListFeedbackSchema.safeParse(req.query);
  if (!parsed.success) { badRequest(res, parsed.error.issues.map((i) => i.message).join('; ')); return; }

  const { channel, sentiment, theme, dateFrom, dateTo, productAreaId, page, limit } = parsed.data;
  const tenantId = req.user!.tenantId;
  const offset = (page - 1) * limit;

  const conditions: string[] = ['fi.tenant_id = $1', 'fi.is_noise = FALSE'];
  const params: unknown[] = [tenantId];
  let paramIdx = 2;

  if (channel) { conditions.push(`fi.channel = $${paramIdx++}`); params.push(channel); }
  if (sentiment) { conditions.push(`fi.sentiment = $${paramIdx++}`); params.push(sentiment); }
  if (productAreaId) { conditions.push(`fi.product_area_id = $${paramIdx++}`); params.push(productAreaId); }
  if (dateFrom) { conditions.push(`fi.received_at >= $${paramIdx++}`); params.push(dateFrom); }
  if (dateTo) { conditions.push(`fi.received_at <= $${paramIdx++}`); params.push(dateTo); }
  if (theme) {
    conditions.push(`EXISTS (SELECT 1 FROM feedback_clusters fc WHERE fc.feedback_item_id = fi.id AND fc.theme_id = $${paramIdx++})`);
    params.push(theme);
  }

  const where = conditions.join(' AND ');
  const [itemsResult, countResult] = await Promise.all([
    query(
      `SELECT fi.id, fi.channel, fi.author, fi.body, fi.sentiment, fi.sentiment_score,
              fi.received_at, fi.product_area_id, fi.source_url
       FROM feedback_items fi WHERE ${where} ORDER BY fi.received_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx}`,
      [...params, limit, offset]
    ),
    query(`SELECT COUNT(*) as total FROM feedback_items fi WHERE ${where}`, params),
  ]);

  ok(res, { items: itemsResult.rows, pagination: { page, limit, total: parseInt(countResult.rows[0].total as string, 10) } });
});

// ─── POST /sync — trigger ingestion ──────────────────────────────────────────

router.post('/sync', async (req: Request, res: Response) => {
  const jobId = uuidv4();
  syncJobs.set(jobId, { status: 'pending', progress: 0, total: 0 });
  setImmediate(async () => {
    const job = syncJobs.get(jobId)!;
    job.status = 'running';
    try {
      job.status = 'done';
    } catch (err) {
      job.status = 'error';
      console.error('[sync] error:', err);
    }
  });
  ok(res, { jobId, message: 'Sync started.' }, 202);
});

// ─── GET /themes ──────────────────────────────────────────────────────────────

router.get('/themes', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId;
  const { productAreaId } = req.query as { productAreaId?: string };
  const conditions = ['tenant_id = $1'];
  const params: unknown[] = [tenantId];
  if (productAreaId) { conditions.push('product_area_id = $2'); params.push(productAreaId); }
  const result = await query(
    `SELECT id, name, description, item_count, created_at FROM feedback_themes WHERE ${conditions.join(' AND ')} ORDER BY item_count DESC`,
    params
  );
  ok(res, { themes: result.rows });
});

// ─── GET /sentiment ───────────────────────────────────────────────────────────

router.get('/sentiment', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId;
  const { productAreaId, dateFrom, dateTo } = req.query as Record<string, string | undefined>;
  const conditions: string[] = ['tenant_id = $1', 'is_noise = FALSE'];
  const params: unknown[] = [tenantId];
  let paramIdx = 2;
  if (productAreaId) { conditions.push(`product_area_id = $${paramIdx++}`); params.push(productAreaId); }
  if (dateFrom) { conditions.push(`received_at >= $${paramIdx++}`); params.push(dateFrom); }
  if (dateTo) { conditions.push(`received_at <= $${paramIdx++}`); params.push(dateTo); }
  const result = await query(
    `SELECT sentiment, COUNT(*) as count, ROUND(AVG(sentiment_score), 3) as avg_score FROM feedback_items WHERE ${conditions.join(' AND ')} GROUP BY sentiment`,
    params
  );
  ok(res, { breakdown: result.rows });
});

// ─── POST /items/:id/flag ─────────────────────────────────────────────────────

router.post('/items/:id/flag', async (req: Request, res: Response) => {
  const { id } = req.params;
  const tenantId = req.user!.tenantId;
  const { flag } = req.body as { flag?: boolean };
  const existing = await query('SELECT id, is_noise FROM feedback_items WHERE id = $1 AND tenant_id = $2 LIMIT 1', [id, tenantId]);
  if (!existing.rows[0]) { notFound(res, 'Feedback item not found'); return; }
  const isNoise = flag !== false;
  await query(
    'UPDATE feedback_items SET is_noise = $1, flagged_at = $2, flagged_by = $3 WHERE id = $4 AND tenant_id = $5',
    [isNoise, isNoise ? new Date() : null, isNoise ? req.user!.id : null, id, tenantId]
  );
  ok(res, { id, isNoise });
});

// ─── POST /upload — parse & analyse, return preview (no pipeline auto-run) ───

router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) { badRequest(res, `No file uploaded. Accepted types: ${ACCEPTED_EXTS.join(', ')}`); return; }

  const tenantId = req.user!.tenantId;
  const userId = req.user!.id;
  const productAreaId = (req.body as { productAreaId?: string }).productAreaId
    ?? (req.query as { productAreaId?: string }).productAreaId ?? null;

  const ext = '.' + (req.file.originalname.split('.').pop() ?? '').toLowerCase();

  let items: NormalisedItem[];
  try {
    items = await parseFileToItems(req.file.buffer, ext, req.file.originalname);
  } catch (err) {
    badRequest(res, `Failed to parse file: ${(err as Error).message}`); return;
  }

  if (items.length === 0) { badRequest(res, 'No readable feedback content found in the file.'); return; }

  // Sentiment + theme analysis
  const analysisInput = items.map((item, idx) => ({ id: String(idx), body: item.body }));
  let analysisResults;
  try {
    analysisResults = await analyseFeedback(analysisInput, tenantId);
  } catch {
    analysisResults = analysisInput.map((_, idx) => ({ id: String(idx), sentiment: 'neutral' as const, sentimentScore: 0.5, themes: [] as string[] }));
  }

  // Insert feedback items
  const insertedIds: string[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const analysis = analysisResults[i] ?? { sentiment: 'neutral', sentimentScore: 0.5, themes: [] };
    const itemId = uuidv4();
    await query(
      `INSERT INTO feedback_items (id, tenant_id, product_area_id, channel, author, body, sentiment, sentiment_score, received_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [itemId, tenantId, productAreaId, ext === '.eml' || ext === '.mbox' ? 'Email' : 'Document',
       item.author, item.body, analysis.sentiment, analysis.sentimentScore,
       item.receivedAt ?? new Date().toISOString()]
    );
    insertedIds.push(itemId);
  }

  // Compute themes + counts + evidence for preview
  const themeCountMap = new Map<string, number>();
  const themeEvidenceMap = new Map<string, string>();
  for (const result of analysisResults) {
    for (const tm of result.themes) {
      themeCountMap.set(tm.name, (themeCountMap.get(tm.name) ?? 0) + 1);
      if (!themeEvidenceMap.has(tm.name) && tm.snippet) themeEvidenceMap.set(tm.name, tm.snippet);
    }
  }
  const themes = [...themeCountMap.keys()];
  const themeCounts = themes.map((t) => themeCountMap.get(t)!);
  const themeEvidence = themes.map((t) => themeEvidenceMap.get(t) ?? '');

  // Build preview — do NOT run pipeline yet
  const preview = buildPipelinePreview(themes, themeCounts, items.length);

  ok(res, {
    inserted: insertedIds.length,
    ids: insertedIds,
    themes,
    themeCounts,
    themeEvidence,
    feedbackCount: items.length,
    productAreaId,
    preview,
    message: `${insertedIds.length} feedback item(s) imported from "${req.file.originalname}". Review the AI plan below and approve to generate documents.`,
  }, 201);
});

// ─── POST /analyse-existing — analyse feedback already in DB, return preview ──

router.post('/analyse-existing', async (req: Request, res: Response) => {
  const { productAreaId } = req.body as { productAreaId?: string | null };
  const tenantId = req.user!.tenantId;

  const conditions = ['tenant_id = $1', 'is_noise = FALSE'];
  const params: unknown[] = [tenantId];
  if (productAreaId) { conditions.push('product_area_id = $2'); params.push(productAreaId); }

  const itemsResult = await query(
    `SELECT id, body FROM feedback_items WHERE ${conditions.join(' AND ')} ORDER BY received_at DESC LIMIT 200`,
    params
  );

  if (itemsResult.rows.length === 0) {
    badRequest(res, 'No feedback items found to analyse.'); return;
  }

  const analysisInput = itemsResult.rows.map((r: Record<string, unknown>) => ({ id: r.id as string, body: r.body as string }));
  let analysisResults;
  try {
    analysisResults = await analyseFeedback(analysisInput, tenantId);
  } catch {
    analysisResults = analysisInput.map((item) => ({ id: item.id, sentiment: 'neutral' as const, sentimentScore: 0.5, themes: [] as string[] }));
  }

  const themeCountMap = new Map<string, number>();
  const themeEvidenceMap = new Map<string, string>();
  for (const result of analysisResults) {
    for (const tm of result.themes) {
      themeCountMap.set(tm.name, (themeCountMap.get(tm.name) ?? 0) + 1);
      if (!themeEvidenceMap.has(tm.name) && tm.snippet) themeEvidenceMap.set(tm.name, tm.snippet);
    }
  }

  if (themeCountMap.size === 0) {
    badRequest(res, 'Could not extract themes from existing feedback. Try uploading more feedback.'); return;
  }

  const themes = [...themeCountMap.keys()];
  const themeCounts = themes.map((t) => themeCountMap.get(t)!);
  const themeEvidence = themes.map((t) => themeEvidenceMap.get(t) ?? '');
  const preview = buildPipelinePreview(themes, themeCounts, itemsResult.rows.length);

  ok(res, {
    themes,
    themeCounts,
    themeEvidence,
    feedbackCount: itemsResult.rows.length,
    productAreaId: productAreaId ?? null,
    preview,
    message: `Analysed ${itemsResult.rows.length} existing feedback item(s). Review the AI plan below and approve to generate documents.`,
  });
});

// ─── POST /pipeline/commit — approve and run pipeline (SSE) ──────────────────

router.post('/pipeline/commit', async (req: Request, res: Response) => {
  const { themes, themeCounts, feedbackCount, productAreaId, prdTitle, sprintName } = req.body as {
    themes: string[];
    themeCounts: number[];
    feedbackCount: number;
    productAreaId?: string | null;
    prdTitle?: string;
    sprintName?: string;
  };

  if (!Array.isArray(themes) || themes.length === 0) {
    badRequest(res, 'themes array is required'); return;
  }

  const tenantId = req.user!.tenantId;
  const userId = req.user!.id;

  const stream = createSSEStream(res);

  try {
    const result = await runFeedbackPipeline(
      { tenantId, productAreaId: productAreaId ?? null, userId, themes, themeCounts: themeCounts ?? themes.map(() => 1), feedbackCount: feedbackCount ?? themes.length, prdTitle, sprintName },
      (step, message) => stream.writeEvent('progress', { step, message })
    );
    stream.writeEvent('done', {
      ...result,
      message: `Pipeline complete! Generated PRD, User Stories, Acceptance Criteria, ${result.roadmapIds.length} roadmap items, and a sprint with tickets.`,
    });
  } catch (err) {
    stream.error((err as Error).message ?? 'Pipeline failed', 'PIPELINE_ERROR');
    return;
  }

  stream.end();
});

// ─── POST /pipeline/run-from-existing — run pipeline from stored themes (SSE) ──
// Called when feedback already exists but roadmap/PRD has not been generated yet.

router.post('/pipeline/run-from-existing', async (req: Request, res: Response) => {
  const { productAreaId, prdTitle, sprintName } = req.body as {
    productAreaId?: string | null;
    prdTitle?: string;
    sprintName?: string;
  };

  const tenantId = req.user!.tenantId;
  const userId = req.user!.id;

  // Load themes from DB
  const conditions: string[] = ['tenant_id = $1'];
  const params: unknown[] = [tenantId];
  if (productAreaId) { conditions.push('product_area_id = $2'); params.push(productAreaId); }

  const themeRows = await query(
    `SELECT name, item_count FROM feedback_themes WHERE ${conditions.join(' AND ')} ORDER BY item_count DESC`,
    params
  );

  if (themeRows.rows.length === 0) {
    badRequest(res, 'No feedback themes found. Upload feedback first.'); return;
  }

  const themes = themeRows.rows.map((r) => r.name as string);
  const themeCounts = themeRows.rows.map((r) => r.item_count as number);
  const feedbackCountRow = await query(
    `SELECT count(*) as c FROM feedback_items WHERE tenant_id = $1${productAreaId ? ' AND product_area_id = $2' : ''}`,
    productAreaId ? [tenantId, productAreaId] : [tenantId]
  );
  const feedbackCount = Number(feedbackCountRow.rows[0]?.c ?? themes.length);

  const stream = createSSEStream(res);

  try {
    const result = await runFeedbackPipeline(
      { tenantId, productAreaId: productAreaId ?? null, userId, themes, themeCounts, feedbackCount, prdTitle, sprintName },
      (step, message) => stream.writeEvent('progress', { step, message })
    );
    stream.writeEvent('done', {
      ...result,
      message: `Pipeline complete! Generated PRD, User Stories, ${result.roadmapIds.length} roadmap items and a sprint.`,
    });
  } catch (err) {
    stream.error((err as Error).message ?? 'Pipeline failed', 'PIPELINE_ERROR');
    return;
  }

  stream.end();
});

// ─── GET /stream/sync/:jobId — SSE progress ───────────────────────────────────

router.get('/stream/sync/:jobId', (req: Request, res: Response) => {
  const { jobId } = req.params as Record<string, string>;
  const stream = createSSEStream(res);
  const poll = setInterval(() => {
    const job = syncJobs.get(jobId);
    if (!job) { stream.error(`Job ${jobId} not found`, 'JOB_NOT_FOUND'); clearInterval(poll); return; }
    stream.writeEvent('progress', job);
    if (job.status === 'done' || job.status === 'error') { clearInterval(poll); stream.end(); }
  }, 500);
  req.on('close', () => clearInterval(poll));
});

export default router;
