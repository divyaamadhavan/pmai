import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../../db/index.js';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { createSSEStream } from '../../lib/sse.js';
import { ok, badRequest, notFound } from '../../lib/response.js';
import { generateRoadmapJustification, analyseTradeoffs } from '../../ai/index.js';

const router = Router();
router.use(requireAuth);

const CreateItemSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().optional(),
  status: z.enum(['backlog', 'planned', 'in_progress', 'done', 'cancelled']).default('backlog'),
  productAreaId: z.string().uuid().optional(),
  opportunityId: z.string().uuid().optional(),
  targetQuarter: z.string().max(20).optional(),
});

const UpdateItemSchema = CreateItemSchema.partial().extend({
  priorityScore: z.number().min(0).max(100).optional(),
  justification: z.string().optional(),
});

const TradeoffSchema = z.object({
  itemIds: z.array(z.string().uuid()).min(2).max(10),
});

// ─── GET / — list roadmap items ───────────────────────────────────────────────

router.get('/', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId;
  const { status, productAreaId, quarter } = req.query as Record<string, string | undefined>;

  const conditions: string[] = ['ri.tenant_id = $1'];
  const params: unknown[] = [tenantId];
  let paramIdx = 2;

  if (status) { conditions.push(`ri.status = $${paramIdx++}`); params.push(status); }
  if (productAreaId) { conditions.push(`ri.product_area_id = $${paramIdx++}`); params.push(productAreaId); }
  if (quarter) { conditions.push(`ri.target_quarter = $${paramIdx++}`); params.push(quarter); }

  const result = await query(
    `SELECT ri.id, ri.title, ri.description, ri.status, ri.priority_score,
            ri.justification, ri.target_quarter, ri.product_area_id, ri.opportunity_id,
            ri.created_at, ri.updated_at,
            u.full_name as created_by_name
     FROM roadmap_items ri
     LEFT JOIN users u ON u.id = ri.created_by
     WHERE ${conditions.join(' AND ')}
     ORDER BY ri.priority_score DESC NULLS LAST, ri.created_at DESC`,
    params
  );

  ok(res, { items: result.rows });
});

// ─── POST / — create roadmap item ────────────────────────────────────────────

router.post('/', requireRole('PM', 'Product Leader'), async (req: Request, res: Response) => {
  const parsed = CreateItemSchema.safeParse(req.body);
  if (!parsed.success) {
    badRequest(res, parsed.error.issues.map((i) => i.message).join('; '));
    return;
  }

  const { title, description, status, productAreaId, opportunityId, targetQuarter } = parsed.data;
  const id = uuidv4();
  const tenantId = req.user!.tenantId;

  await query(
    `INSERT INTO roadmap_items
       (id, tenant_id, product_area_id, opportunity_id, title, description, status, target_quarter, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [id, tenantId, productAreaId ?? null, opportunityId ?? null, title, description ?? null, status, targetQuarter ?? null, req.user!.id]
  );

  const result = await query('SELECT * FROM roadmap_items WHERE id = $1', [id]);
  ok(res, result.rows[0], 201);
});

// ─── PUT /:id ─────────────────────────────────────────────────────────────────

router.put('/:id', requireRole('PM', 'Product Leader'), async (req: Request, res: Response) => {
  const { id } = req.params;
  const tenantId = req.user!.tenantId;

  const parsed = UpdateItemSchema.safeParse(req.body);
  if (!parsed.success) {
    badRequest(res, parsed.error.issues.map((i) => i.message).join('; '));
    return;
  }

  const existing = await query(
    'SELECT id FROM roadmap_items WHERE id = $1 AND tenant_id = $2',
    [id, tenantId]
  );
  if (!existing.rows[0]) { notFound(res, 'Roadmap item not found'); return; }

  const { title, description, status, productAreaId, opportunityId, targetQuarter, priorityScore, justification } = parsed.data;

  const sets: string[] = ['updated_at = NOW()'];
  const params: unknown[] = [];
  let idx = 1;

  const add = (col: string, val: unknown) => { sets.push(`${col} = $${idx++}`); params.push(val); };

  if (title !== undefined) add('title', title);
  if (description !== undefined) add('description', description);
  if (status !== undefined) add('status', status);
  if (productAreaId !== undefined) add('product_area_id', productAreaId);
  if (opportunityId !== undefined) add('opportunity_id', opportunityId);
  if (targetQuarter !== undefined) add('target_quarter', targetQuarter);
  if (priorityScore !== undefined) add('priority_score', priorityScore);
  if (justification !== undefined) add('justification', justification);

  params.push(id, tenantId);
  await query(
    `UPDATE roadmap_items SET ${sets.join(', ')} WHERE id = $${idx++} AND tenant_id = $${idx}`,
    params
  );

  const updated = await query('SELECT * FROM roadmap_items WHERE id = $1', [id]);
  ok(res, updated.rows[0]);
});

// ─── DELETE /:id ──────────────────────────────────────────────────────────────

router.delete('/:id', requireRole('Product Leader', 'Admin'), async (req: Request, res: Response) => {
  const { id } = req.params as Record<string, string>;
  const tenantId = req.user!.tenantId;

  const result = await query(
    'DELETE FROM roadmap_items WHERE id = $1 AND tenant_id = $2 RETURNING id',
    [id, tenantId]
  );

  if (!result.rows[0]) { notFound(res, 'Roadmap item not found'); return; }

  ok(res, { deleted: true, id });
});

// ─── POST /:id/justification — SSE justification ─────────────────────────────

router.post('/:id/justification', async (req: Request, res: Response) => {
  const { id } = req.params as Record<string, string>;
  const tenantId = req.user!.tenantId;

  const existing = await query(
    'SELECT id, title FROM roadmap_items WHERE id = $1 AND tenant_id = $2',
    [id, tenantId]
  );
  if (!existing.rows[0]) {
    const stream = createSSEStream(res);
    stream.error('Roadmap item not found', 'NOT_FOUND');
    return;
  }

  const stream = createSSEStream(res);

  try {
    // TODO: call AG-04 via orchestration layer
    await generateRoadmapJustification(id, tenantId, (chunk) => stream.write(chunk));
  } catch (err) {
    stream.error((err as Error).message ?? 'Justification generation failed', 'AI_ERROR');
    return;
  }

  stream.end();
});

// ─── POST /tradeoff — compare items SSE ──────────────────────────────────────

router.post('/tradeoff', async (req: Request, res: Response) => {
  const parsed = TradeoffSchema.safeParse(req.body);
  if (!parsed.success) {
    badRequest(res, parsed.error.issues.map((i) => i.message).join('; '));
    return;
  }

  const tenantId = req.user!.tenantId;
  const stream = createSSEStream(res);

  try {
    // TODO: call AG-04 (tradeoff mode) via orchestration layer
    await analyseTradeoffs(parsed.data.itemIds, tenantId, (chunk) => stream.write(chunk));
  } catch (err) {
    stream.error((err as Error).message ?? 'Tradeoff analysis failed', 'AI_ERROR');
    return;
  }

  stream.end();
});

export default router;
