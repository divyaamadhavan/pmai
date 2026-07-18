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
import { analyseFeedback, buildPipelinePreview, classifyThemes } from '../../ai/index.js';
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
  status: z.enum(['new', 'addressed']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
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

  const { channel, sentiment, theme, dateFrom, dateTo, productAreaId, status, page, limit } = parsed.data;
  const tenantId = req.user!.tenantId;
  const offset = (page - 1) * limit;

  const conditions: string[] = ['fi.tenant_id = $1', 'fi.is_noise = FALSE'];
  const params: unknown[] = [tenantId];
  let paramIdx = 2;

  if (channel) { conditions.push(`fi.channel = $${paramIdx++}`); params.push(channel); }
  if (sentiment) { conditions.push(`fi.sentiment = $${paramIdx++}`); params.push(sentiment); }
  if (productAreaId) { conditions.push(`fi.product_area_id = $${paramIdx++}`); params.push(productAreaId); }
  if (status) { conditions.push(`COALESCE(fi.status,'new') = $${paramIdx++}`); params.push(status); }
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
              fi.received_at, fi.product_area_id, fi.source_url, COALESCE(fi.status,'new') as status,
              fi.agent_category, fi.agent_priority, fi.agent_composite_score
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
    `SELECT id, name, description, item_count, created_at, agent_triage_decision, agent_triage_rationale, agent_triage_details, agent_triage_actioned FROM feedback_themes WHERE ${conditions.join(' AND ')} ORDER BY item_count DESC`,
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

// ─── DELETE /items/:id — delete a feedback item ──────────────────────────────

router.delete('/items/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const tenantId = req.user!.tenantId;
  const existing = await query('SELECT id FROM feedback_items WHERE id = $1 AND tenant_id = $2 LIMIT 1', [id, tenantId]);
  if (!existing.rows[0]) { notFound(res, 'Feedback item not found'); return; }
  await query('DELETE FROM feedback_clusters WHERE feedback_item_id = $1', [id]);
  await query('DELETE FROM feedback_items WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
  ok(res, { id, deleted: true });
});

// ─── PATCH /items/:id/address — mark feedback item as addressed ───────────────

router.patch('/items/:id/address', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body as { status?: 'new' | 'addressed' };
  const tenantId = req.user!.tenantId;
  const existing = await query('SELECT id FROM feedback_items WHERE id = $1 AND tenant_id = $2 LIMIT 1', [id, tenantId]);
  if (!existing.rows[0]) { notFound(res, 'Feedback item not found'); return; }
  const newStatus = status ?? 'addressed';
  await query('UPDATE feedback_items SET status = $1 WHERE id = $2 AND tenant_id = $3', [newStatus, id, tenantId]);
  ok(res, { id, status: newStatus });
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
      [itemId, tenantId, productAreaId,
       ext === '.eml' || ext === '.mbox' ? 'Email' : ext === '.csv' ? 'CSV' : 'Manual',
       item.author, item.body, analysis.sentiment, analysis.sentimentScore,
       item.receivedAt ?? new Date().toISOString()]
    );
    insertedIds.push(itemId);
  }

  // Compute themes + counts + evidence
  const themeCountMap = new Map<string, number>();
  const themeEvidenceMap = new Map<string, string>();
  // Map: themeName → list of feedback item indices that matched
  const themeItemsMap = new Map<string, number[]>();
  for (let i = 0; i < analysisResults.length; i++) {
    for (const tm of analysisResults[i].themes) {
      themeCountMap.set(tm.name, (themeCountMap.get(tm.name) ?? 0) + 1);
      if (!themeEvidenceMap.has(tm.name) && tm.snippet) themeEvidenceMap.set(tm.name, tm.snippet);
      const arr = themeItemsMap.get(tm.name) ?? [];
      arr.push(i);
      themeItemsMap.set(tm.name, arr);
    }
  }
  const themes = [...themeCountMap.keys()];
  const themeCounts = themes.map((t) => themeCountMap.get(t)!);
  const themeEvidence = themes.map((t) => themeEvidenceMap.get(t) ?? '');

  // Persist themes + clusters so "Classify & Score" can work immediately
  const savedThemeIds: string[] = [];
  for (let tIdx = 0; tIdx < themes.length; tIdx++) {
    const themeName = themes[tIdx];
    const existingTheme = await query(
      'SELECT id FROM feedback_themes WHERE tenant_id = $1 AND name = $2 LIMIT 1',
      [tenantId, themeName]
    );
    let themeId: string;
    if (existingTheme.rows[0]) {
      themeId = (existingTheme.rows[0] as Record<string, unknown>).id as string;
      await query('UPDATE feedback_themes SET item_count = item_count + $1, updated_at = datetime(\'now\') WHERE id = $2', [themeCounts[tIdx], themeId]);
    } else {
      themeId = uuidv4();
      await query(
        'INSERT INTO feedback_themes (id, tenant_id, product_area_id, name, item_count) VALUES ($1,$2,$3,$4,$5)',
        [themeId, tenantId, productAreaId, themeName, themeCounts[tIdx]]
      );
    }
    savedThemeIds.push(themeId);
    // Create cluster entries linking feedback items → theme
    for (const itemIdx of (themeItemsMap.get(themeName) ?? [])) {
      try {
        await query(
          'INSERT INTO feedback_clusters (id, tenant_id, product_area_id, theme_id, feedback_item_id) VALUES ($1,$2,$3,$4,$5)',
          [uuidv4(), tenantId, productAreaId, themeId, insertedIds[itemIdx]]
        );
      } catch { /* duplicate — ignore */ }
    }
  }

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
    message: `${insertedIds.length} feedback item(s) imported. ${themes.length} theme(s) detected — click "Classify & Score" to analyse.`,
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
  const themeItemsMapExisting = new Map<string, string[]>(); // themeName → feedback_item_id[]
  for (let i = 0; i < analysisResults.length; i++) {
    for (const tm of analysisResults[i].themes) {
      themeCountMap.set(tm.name, (themeCountMap.get(tm.name) ?? 0) + 1);
      if (!themeEvidenceMap.has(tm.name) && tm.snippet) themeEvidenceMap.set(tm.name, tm.snippet);
      const arr = themeItemsMapExisting.get(tm.name) ?? [];
      arr.push(itemsResult.rows[i].id as string);
      themeItemsMapExisting.set(tm.name, arr);
    }
  }

  if (themeCountMap.size === 0) {
    badRequest(res, 'Could not extract themes from existing feedback. Try uploading more feedback.'); return;
  }

  const themes = [...themeCountMap.keys()];
  const themeCounts = themes.map((t) => themeCountMap.get(t)!);
  const themeEvidence = themes.map((t) => themeEvidenceMap.get(t) ?? '');

  // Persist / refresh themes + clusters
  for (let tIdx = 0; tIdx < themes.length; tIdx++) {
    const themeName = themes[tIdx];
    const existingTheme = await query(
      'SELECT id FROM feedback_themes WHERE tenant_id = $1 AND name = $2 LIMIT 1',
      [tenantId, themeName]
    );
    let themeId: string;
    if (existingTheme.rows[0]) {
      themeId = (existingTheme.rows[0] as Record<string, unknown>).id as string;
      await query('UPDATE feedback_themes SET item_count = $1, updated_at = datetime(\'now\') WHERE id = $2', [themeCounts[tIdx], themeId]);
    } else {
      themeId = uuidv4();
      await query(
        'INSERT INTO feedback_themes (id, tenant_id, product_area_id, name, item_count) VALUES ($1,$2,$3,$4,$5)',
        [themeId, tenantId, productAreaId ?? null, themeName, themeCounts[tIdx]]
      );
    }
    for (const feedbackItemId of (themeItemsMapExisting.get(themeName) ?? [])) {
      try {
        await query(
          'INSERT INTO feedback_clusters (id, tenant_id, product_area_id, theme_id, feedback_item_id) VALUES ($1,$2,$3,$4,$5)',
          [uuidv4(), tenantId, productAreaId ?? null, themeId, feedbackItemId]
        );
      } catch { /* duplicate cluster — ignore */ }
    }
  }

  const preview = buildPipelinePreview(themes, themeCounts, itemsResult.rows.length);

  ok(res, {
    themes,
    themeCounts,
    themeEvidence,
    feedbackCount: itemsResult.rows.length,
    productAreaId: productAreaId ?? null,
    preview,
    message: `Analysed ${itemsResult.rows.length} feedback item(s). ${themes.length} theme(s) detected — click "Classify & Score" to analyse.`,
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

// ─── POST /classify — classify themes into PM-actionable categories ───────────

router.post('/classify', async (req: Request, res: Response) => {
  const { themes, themeCounts, productAreaId } = req.body as {
    themes: string[];
    themeCounts: number[];
    productAreaId?: string | null;
  };

  if (!Array.isArray(themes) || themes.length === 0) {
    badRequest(res, 'themes array is required'); return;
  }

  const tenantId = req.user!.tenantId;

  // Fetch sentiment breakdown per theme from DB
  const sentimentBreakdowns: Array<{ negative: number; total: number }> = [];
  for (const theme of themes) {
    const themeRow = await query(
      `SELECT id FROM feedback_themes WHERE tenant_id = $1 AND name = $2 LIMIT 1`,
      [tenantId, theme]
    );
    if (themeRow.rows[0]) {
      const themeId = (themeRow.rows[0] as Record<string, unknown>).id as string;
      const sentResult = await query(
        `SELECT sentiment, COUNT(*) as cnt FROM feedback_items fi
         INNER JOIN feedback_clusters fc ON fc.feedback_item_id = fi.id
         WHERE fc.theme_id = $1 AND fi.tenant_id = $2 GROUP BY sentiment`,
        [themeId, tenantId]
      );
      let neg = 0, total = 0;
      for (const row of sentResult.rows as Array<Record<string, unknown>>) {
        total += Number(row.cnt);
        if (row.sentiment === 'negative') neg += Number(row.cnt);
      }
      sentimentBreakdowns.push({ negative: neg, total: total || (themeCounts[themes.indexOf(theme)] ?? 1) });
    } else {
      sentimentBreakdowns.push({ negative: 0, total: themeCounts[themes.indexOf(theme)] ?? 1 });
    }
  }

  const classifications = classifyThemes(themes, themeCounts, sentimentBreakdowns);

  // Upsert classifications into DB
  for (const c of classifications) {
    const existing = await query(
      `SELECT id FROM feedback_classifications WHERE tenant_id = $1 AND theme_name = $2 LIMIT 1`,
      [tenantId, c.themeName]
    );
    if (existing.rows[0]) {
      const existId = (existing.rows[0] as Record<string, unknown>).id as string;
      await query(
        `UPDATE feedback_classifications SET category=$1, priority=$2, priority_rationale=$3,
         benefits=$4, tradeoffs=$5, affected_users=$6, revenue_impact=$7, feedback_count=$8,
         customer_aspect=$9, critical_recommendation=$10, critical_reason=$11,
         financial_benefits=$12, qualitative_benefits=$13, type=$14, updated_at=datetime('now') WHERE id=$15`,
        [c.category, c.priority, c.priorityRationale,
         JSON.stringify([...c.financialBenefits, ...c.qualitativeBenefits]),
         JSON.stringify(c.tradeoffs), c.affectedUsers, c.revenueImpact, c.feedbackCount,
         c.customerAspect, c.criticalRecommendation ? 1 : 0, c.criticalReason,
         JSON.stringify(c.financialBenefits), JSON.stringify(c.qualitativeBenefits), c.type, existId]
      );
    } else {
      const { v4: uuidv4 } = await import('uuid');
      await query(
        `INSERT INTO feedback_classifications
         (id, tenant_id, product_area_id, theme_name, category, priority, priority_rationale,
          benefits, tradeoffs, affected_users, revenue_impact, feedback_count,
          customer_aspect, critical_recommendation, critical_reason, financial_benefits, qualitative_benefits, type)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
        [uuidv4(), tenantId, productAreaId ?? null, c.themeName, c.category, c.priority,
         c.priorityRationale, JSON.stringify([...c.financialBenefits, ...c.qualitativeBenefits]),
         JSON.stringify(c.tradeoffs), c.affectedUsers, c.revenueImpact, c.feedbackCount,
         c.customerAspect, c.criticalRecommendation ? 1 : 0, c.criticalReason,
         JSON.stringify(c.financialBenefits), JSON.stringify(c.qualitativeBenefits), c.type]
      );
    }
  }

  ok(res, { classifications });
});

// ─── GET /classifications — list saved classifications ────────────────────────

router.get('/classifications', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId;
  const { productAreaId } = req.query as { productAreaId?: string };
  const conditions = ['tenant_id = $1'];
  const params: unknown[] = [tenantId];
  if (productAreaId) { conditions.push('product_area_id = $2'); params.push(productAreaId); }
  const result = await query(
    `SELECT * FROM feedback_classifications WHERE ${conditions.join(' AND ')} ORDER BY
     CASE priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
     feedback_count DESC`,
    params
  );
  ok(res, { classifications: result.rows });
});

// ─── PATCH /classifications/:id/decision — record PM decision ────────────────

router.patch('/classifications/:id/decision', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { decision } = req.body as { decision: 'backlog' | 'dismissed' | 'pending' };
  const tenantId = req.user!.tenantId;

  const allowed = ['backlog', 'dismissed', 'pending'];
  if (!allowed.includes(decision)) { badRequest(res, 'Invalid decision value'); return; }

  const existing = await query(
    `SELECT id, theme_name, category FROM feedback_classifications WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
    [id, tenantId]
  );
  if (!existing.rows[0]) { notFound(res, 'Classification not found'); return; }

  await query(
    `UPDATE feedback_classifications SET pm_decision=$1, pm_decision_at=datetime('now'), updated_at=datetime('now') WHERE id=$2`,
    [decision, id]
  );

  // Mark a feedback item as addressed only when ALL its themes have a non-pending decision
  if (decision !== 'pending') {
    const row = existing.rows[0] as Record<string, unknown>;
    const themeRow = await query(
      `SELECT id FROM feedback_themes WHERE tenant_id = $1 AND name = $2 LIMIT 1`,
      [tenantId, row.theme_name]
    );
    if (themeRow.rows[0]) {
      const themeId = (themeRow.rows[0] as Record<string, unknown>).id as string;
      // Get all feedback items linked to this theme
      const itemsInTheme = await query(
        `SELECT feedback_item_id FROM feedback_clusters WHERE theme_id = $1`,
        [themeId]
      );
      for (const itemRow of itemsInTheme.rows as Array<{ feedback_item_id: string }>) {
        const fid = itemRow.feedback_item_id;
        // Count how many themes this item belongs to that are still pending
        const pendingCheck = await query(
          `SELECT COUNT(*) as cnt
           FROM feedback_clusters fc
           JOIN feedback_themes ft ON ft.id = fc.theme_id
           JOIN feedback_classifications fc2
             ON fc2.theme_name = ft.name AND fc2.tenant_id = $2
           WHERE fc.feedback_item_id = $1
             AND fc2.pm_decision = 'pending'`,
          [fid, tenantId]
        );
        const pendingCount = Number((pendingCheck.rows[0] as { cnt: number }).cnt);
        if (pendingCount === 0) {
          await query(
            `UPDATE feedback_items SET status = 'addressed' WHERE id = $1 AND tenant_id = $2`,
            [fid, tenantId]
          );
        }
      }
    }
  }

  // If adding to backlog, create a roadmap item and auto-draft a PRD
  let roadmapItemId: string | null = null;
  if (decision === 'backlog') {
    const row = existing.rows[0] as Record<string, unknown>;
    const { v4: uuidv4 } = await import('uuid');
    roadmapItemId = uuidv4();
    const itemTitle = `[${row.category}] ${row.theme_name}`;
    await query(
      `INSERT INTO roadmap_items (id, tenant_id, title, description, status, priority_score, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [roadmapItemId, tenantId,
       itemTitle,
       `PM decision: backlog. Classified from customer feedback.`,
       'planned', 5,
       req.user!.id]
    );
    await query(
      `UPDATE feedback_classifications SET roadmap_item_id=$1 WHERE id=$2`,
      [roadmapItemId, id]
    );

    // Auto-create PRD for this backlog item
    (async () => {
      try {
        const existingPrd = await query(
          `SELECT id FROM documents WHERE tenant_id = $1 AND type = 'PRD' AND (title = $2 OR title = $3) LIMIT 1`,
          [tenantId, `PRD Draft: ${itemTitle}`, itemTitle]
        );
        if (existingPrd.rows.length > 0) return;
        const linkedThemes = await query(
          `SELECT DISTINCT theme_name FROM feedback_classifications WHERE tenant_id = $1 AND pm_decision = 'backlog' LIMIT 5`,
          [tenantId]
        );
        const themes = (linkedThemes.rows as Array<{ theme_name: string }>).map(r => r.theme_name);
        const prdContent = `# PRD Draft — ${itemTitle}

> **Status:** Draft — auto-generated by PMAI when theme moved to Backlog.
> **Generated:** ${new Date().toLocaleString()}

---

## Executive Summary

This PRD covers the requirements for **${itemTitle}**. This theme was identified as a priority from customer feedback analysis.

${themes.length > 0 ? `Evidence from **${themes.length} feedback theme(s)**: ${themes.join(', ')}.` : ''}

---

## Problem Statement

Customers are experiencing friction in this area. Based on collected feedback, this represents a significant opportunity to improve product value.

[PM TO COMPLETE: Add specific customer quotes and data points here.]

---

## Goals & Success Metrics

| Goal | Metric | Target |
|------|--------|--------|
| Improve user satisfaction | NPS / CSAT | +10 points |
| Reduce support tickets | Ticket volume | -30% |
| Drive adoption | Feature usage rate | >40% of DAU |

---

## Functional Requirements

### FR-01: Core Functionality
- Users must be able to perform the primary action within 3 clicks
- System must respond within 2 seconds for all primary actions

### FR-02: Integration
- Must integrate with existing data model
- Must respect tenant-level permissions

[PM TO COMPLETE: Add detailed requirements from engineering discussions.]

---

## Non-Functional Requirements

- **Performance:** p95 response time < 200ms
- **Availability:** 99.9% uptime SLA
- **Security:** Follows existing RBAC model

---

## Out of Scope (Phase 1)

- Mobile native experience
- Bulk operations
- Third-party integrations (deferred to Phase 2)

---

## Timeline & Milestones

| Milestone | Target |
|-----------|--------|
| PRD Approved | [PM TO COMPLETE] |
| Design Done | [PM TO COMPLETE] |
| Engineering Start | [PM TO COMPLETE] |
| GA Release | [PM TO COMPLETE] |

---

*Auto-drafted by PMAI when PM moved theme to Backlog. Linked themes: ${themes.join(', ') || 'none'}. Requires PM review before sharing.*`;

        const prdId = uuidv4();
        await query(
          `INSERT INTO documents (id, tenant_id, created_by, title, type, status, sections, product_area_id)
           VALUES ($1, $2, $3, $4, 'PRD', 'draft', $5, $6)`,
          [prdId, tenantId, req.user!.id, `PRD Draft: ${itemTitle}`, JSON.stringify({ content: prdContent }), null]
        );
        console.log(`[PRD] Auto-created PRD for backlog theme "${itemTitle}" (id: ${prdId})`);
      } catch (err) {
        console.error('[PRD] Auto-create failed:', (err as Error).message);
      }
    })();
  }

  ok(res, { id, decision, roadmapItemId });
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
