import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query } from '../../db/index.js';
import { requireAuth } from '../../middleware/auth.js';
import { createSSEStream } from '../../lib/sse.js';
import { ok, badRequest, fail } from '../../lib/response.js';
import { generateInsightSummary } from '../../ai/index.js';

const router = Router();
router.use(requireAuth);

const GenerateInsightSchema = z.object({
  audience: z.string().min(1),
  productAreaId: z.string().uuid().optional(),
  includeOpportunities: z.boolean().default(true),
  includeFeedbackSummary: z.boolean().default(true),
});

const ExportSchema = z.object({
  format: z.enum(['pdf', 'markdown']),
  productAreaId: z.string().uuid().optional(),
  audience: z.string().optional(),
});

// ─── GET /pipeline-summary — counts for the report snapshot ──────────────────

router.get('/pipeline-summary', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId;
  const { productAreaId } = req.query as Record<string, string | undefined>;

  const areaFilter = productAreaId ? ' AND (product_area_id = $2 OR product_area_id IS NULL)' : '';
  const areaParams = productAreaId ? [tenantId, productAreaId] : [tenantId];

  const [feedback, themes, classifications, roadmap, sprints, tickets] = await Promise.all([
    query(`SELECT COUNT(*) as cnt FROM feedback_items WHERE tenant_id = $1${areaFilter}`, areaParams),
    query(`SELECT COUNT(*) as cnt FROM feedback_themes WHERE tenant_id = $1${areaFilter}`, areaParams),
    query(`SELECT pm_decision, COUNT(*) as cnt FROM feedback_classifications WHERE tenant_id = $1 GROUP BY pm_decision`, [tenantId]),
    query(`SELECT COUNT(*) as cnt FROM roadmap_items WHERE tenant_id = $1`, [tenantId]),
    query(`SELECT id, name FROM sprints WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1`, [tenantId]),
    query(`SELECT COUNT(*) as cnt FROM sprint_tickets WHERE tenant_id = $1`, [tenantId]),
  ]);

  const decisionMap: Record<string, number> = {};
  for (const row of classifications.rows as Array<{ pm_decision: string; cnt: number }>) {
    decisionMap[row.pm_decision] = Number(row.cnt);
  }
  const sprint = (sprints.rows[0] ?? null) as { id: string; name: string } | null;

  ok(res, {
    feedbackCount:   Number((feedback.rows[0] as { cnt: number }).cnt),
    themeCount:      Number((themes.rows[0] as { cnt: number }).cnt),
    backlogCount:    (decisionMap['backlog'] ?? 0) + (decisionMap['book_of_work'] ?? 0),
    dismissedCount:  decisionMap['dismissed'] ?? 0,
    pendingCount:    decisionMap['pending'] ?? 0,
    roadmapCount:    Number((roadmap.rows[0] as { cnt: number }).cnt),
    sprintName:      sprint?.name ?? null,
    ticketCount:     Number((tickets.rows[0] as { cnt: number }).cnt),
  });
});

// ─── GET /opportunities ───────────────────────────────────────────────────────

router.get('/opportunities', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId;
  const { productAreaId, minImpact } = req.query as Record<string, string | undefined>;

  const conditions: string[] = ['tenant_id = $1'];
  const params: unknown[] = [tenantId];
  let paramIdx = 2;

  if (productAreaId) {
    conditions.push(`product_area_id = $${paramIdx++}`);
    params.push(productAreaId);
  }
  if (minImpact) {
    conditions.push(`impact_score >= $${paramIdx++}`);
    params.push(parseFloat(minImpact));
  }

  const result = await query(
    `SELECT id, title, description, evidence, impact_score, effort_score, priority_score,
            product_area_id, created_at, updated_at
     FROM opportunities
     WHERE ${conditions.join(' AND ')}
     ORDER BY priority_score DESC NULLS LAST`,
    params
  );

  ok(res, { opportunities: result.rows });
});

// ─── POST /generate — SSE insight summary (grounded in real pipeline data) ───

router.post('/generate', async (req: Request, res: Response) => {
  const parsed = GenerateInsightSchema.safeParse(req.body);
  if (!parsed.success) {
    badRequest(res, parsed.error.issues.map((i) => i.message).join('; '));
    return;
  }

  const { audience, productAreaId } = parsed.data;
  const tenantId = req.user!.tenantId;
  const stream = createSSEStream(res);

  try {
    // Pull real pipeline data
    const conditions: string[] = ['tenant_id = $1'];
    const params: unknown[] = [tenantId];
    if (productAreaId) { conditions.push('(product_area_id = $2 OR product_area_id IS NULL)'); params.push(productAreaId); }
    const where = conditions.join(' AND ');

    const [themesResult, classificationsResult, roadmapResult, sprintsResult, ticketsResult] = await Promise.all([
      query(`SELECT name, item_count FROM feedback_themes WHERE ${where} ORDER BY item_count DESC LIMIT 10`, params),
      query(`SELECT theme_name, category, priority, pm_decision, feedback_count FROM feedback_classifications WHERE ${where} ORDER BY feedback_count DESC`, params),
      query(`SELECT title, status, description FROM roadmap_items WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 20`, [tenantId]),
      query(`SELECT id, name, goal, start_date, end_date FROM sprints WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1`, [tenantId]),
      query(`SELECT title, status, story_points, type FROM sprint_tickets WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 30`, [tenantId]),
    ]);

    const themes = themesResult.rows as Array<{ name: string; item_count: number }>;
    const classifications = classificationsResult.rows as Array<{ theme_name: string; category: string; priority: string; pm_decision: string; feedback_count: number }>;
    const roadmapItems = roadmapResult.rows as Array<{ title: string; status: string; description: string }>;
    const sprint = (sprintsResult.rows[0] ?? null) as Record<string, string> | null;
    const tickets = ticketsResult.rows as Array<{ title: string; status: string; story_points: number; type: string }>;

    const bookOfWork = classifications.filter(c => c.pm_decision === 'backlog' || c.pm_decision === 'book_of_work');
    const backlog     = bookOfWork;
    const dismissed   = classifications.filter(c => c.pm_decision === 'dismissed');
    const pending     = classifications.filter(c => c.pm_decision === 'pending');

    const totalFeedback = themes.reduce((s, t) => s + Number(t.item_count), 0);
    const totalPoints   = tickets.reduce((s, t) => s + Number(t.story_points ?? 0), 0);
    const doneTickets   = tickets.filter(t => t.status === 'done');
    const inProgress    = tickets.filter(t => t.status === 'in_progress');

    await generateInsightSummary(audience, tenantId, productAreaId, (chunk) => stream.write(chunk), {
      themes, totalFeedback,
      bookOfWork, backlog, dismissed, pending,
      roadmapItems, sprint, tickets, totalPoints, doneTickets, inProgress,
    });
  } catch (err) {
    stream.error((err as Error).message ?? 'Insight generation failed', 'AI_ERROR');
    return;
  }

  stream.end();
});

// ─── POST /export ─────────────────────────────────────────────────────────────

router.post('/export', async (req: Request, res: Response) => {
  const parsed = ExportSchema.safeParse(req.body);
  if (!parsed.success) {
    badRequest(res, parsed.error.issues.map((i) => i.message).join('; '));
    return;
  }

  const { format } = parsed.data;

  // TODO: call AG-03 export mode via orchestration layer, upload to storage, return signed URL
  // Stub: return a placeholder URL
  const exportId = `export-${Date.now()}`;
  ok(res, {
    exportId,
    format,
    url: `/api/exports/${exportId}.${format}`,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    message: 'Export generation is not yet implemented — AG-03 export stub',
  });
});

export default router;
