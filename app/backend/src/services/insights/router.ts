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

// ─── POST /generate — SSE insight summary ────────────────────────────────────

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
    // TODO: call AG-03 via orchestration layer
    await generateInsightSummary(
      audience,
      tenantId,
      productAreaId,
      (chunk) => stream.write(chunk)
    );
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
