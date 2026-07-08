import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../../db/index.js';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { createSSEStream } from '../../lib/sse.js';
import { ok, badRequest, notFound } from '../../lib/response.js';
import { generateSprintTickets, generateSprintBrief, groomBacklog } from '../../ai/index.js';

const router = Router();
router.use(requireAuth);

const GenerateTicketsSchema = z.object({
  roadmapItemId: z.string().uuid(),
  sprintId: z.string().uuid().optional(),
  productAreaId: z.string().uuid().optional(),
});

const GroomSchema = z.object({
  sprintId: z.string().uuid().optional(),
});

const CreateSprintSchema = z.object({
  name: z.string().min(1).max(255),
  goal: z.string().optional(),
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
  productAreaId: z.string().uuid().optional(),
});

// ─── GET /tickets ─────────────────────────────────────────────────────────────

router.get('/tickets', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId;
  const { sprintId, status, type, productAreaId, needsGrooming } = req.query as Record<string, string | undefined>;

  const conditions: string[] = ['tenant_id = $1'];
  const params: unknown[] = [tenantId];
  let paramIdx = 2;

  if (sprintId) { conditions.push(`sprint_id = $${paramIdx++}`); params.push(sprintId); }
  if (status) { conditions.push(`status = $${paramIdx++}`); params.push(status); }
  if (type) { conditions.push(`type = $${paramIdx++}`); params.push(type); }
  if (productAreaId) { conditions.push(`product_area_id = $${paramIdx++}`); params.push(productAreaId); }
  if (needsGrooming === 'true') { conditions.push('needs_grooming = TRUE'); }

  const result = await query(
    `SELECT id, title, description, type, status, story_points,
            acceptance_criteria, needs_grooming, grooming_notes,
            sprint_id, roadmap_item_id, product_area_id, created_at, updated_at
     FROM sprint_tickets
     WHERE ${conditions.join(' AND ')}
     ORDER BY created_at DESC`,
    params
  );

  ok(res, { tickets: result.rows });
});

// ─── POST /tickets/generate — stream ticket generation ───────────────────────

router.post('/tickets/generate', requireRole('PM', 'Scrum Master'), async (req: Request, res: Response) => {
  const parsed = GenerateTicketsSchema.safeParse(req.body);
  if (!parsed.success) {
    badRequest(res, parsed.error.issues.map((i) => i.message).join('; '));
    return;
  }

  const tenantId = req.user!.tenantId;

  const roadmapExists = await query(
    'SELECT id FROM roadmap_items WHERE id = $1 AND tenant_id = $2',
    [parsed.data.roadmapItemId, tenantId]
  );
  if (!roadmapExists.rows[0]) {
    const stream = createSSEStream(res);
    stream.error('Roadmap item not found', 'NOT_FOUND');
    return;
  }

  const stream = createSSEStream(res);
  stream.writeEvent('meta', { roadmapItemId: parsed.data.roadmapItemId });

  try {
    // TODO: call AG-05 via orchestration layer
    await generateSprintTickets(
      parsed.data.roadmapItemId,
      tenantId,
      (chunk) => stream.write(chunk)
    );
  } catch (err) {
    stream.error((err as Error).message ?? 'Ticket generation failed', 'AI_ERROR');
    return;
  }

  stream.end();
});

// ─── GET /sprints ─────────────────────────────────────────────────────────────

router.get('/sprints', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId;
  const { productAreaId } = req.query as { productAreaId?: string };

  const conditions: string[] = ['tenant_id = $1'];
  const params: unknown[] = [tenantId];

  if (productAreaId) {
    conditions.push('product_area_id = $2');
    params.push(productAreaId);
  }

  const result = await query(
    `SELECT id, name, goal, start_date, end_date, product_area_id, created_at, updated_at
     FROM sprints
     WHERE ${conditions.join(' AND ')}
     ORDER BY start_date DESC NULLS LAST`,
    params
  );

  ok(res, { sprints: result.rows });
});

// ─── POST /sprints — create sprint ───────────────────────────────────────────

router.post('/sprints', requireRole('PM', 'Scrum Master'), async (req: Request, res: Response) => {
  const parsed = CreateSprintSchema.safeParse(req.body);
  if (!parsed.success) {
    badRequest(res, parsed.error.issues.map((i) => i.message).join('; '));
    return;
  }

  const { name, goal, startDate, endDate, productAreaId } = parsed.data;
  const id = uuidv4();
  const tenantId = req.user!.tenantId;

  await query(
    `INSERT INTO sprints (id, tenant_id, product_area_id, name, goal, start_date, end_date)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, tenantId, productAreaId ?? null, name, goal ?? null, startDate ?? null, endDate ?? null]
  );

  const result = await query('SELECT * FROM sprints WHERE id = $1', [id]);
  ok(res, result.rows[0], 201);
});

// ─── POST /sprints/:id/brief — stream sprint brief ───────────────────────────

router.post('/sprints/:id/brief', async (req: Request, res: Response) => {
  const { id } = req.params as Record<string, string>;
  const tenantId = req.user!.tenantId;

  const sprint = await query(
    'SELECT id, name, goal, start_date, end_date FROM sprints WHERE id = $1 AND tenant_id = $2',
    [id, tenantId]
  );
  if (!sprint.rows[0]) {
    const stream = createSSEStream(res);
    stream.error('Sprint not found', 'NOT_FOUND');
    return;
  }

  const tickets = await query(
    `SELECT title, description, status, story_points, acceptance_criteria, needs_grooming
     FROM sprint_tickets WHERE sprint_id = $1 AND tenant_id = $2 ORDER BY created_at`,
    [id, tenantId]
  );

  const stream = createSSEStream(res);
  stream.writeEvent('meta', { sprintId: id, sprintName: sprint.rows[0].name });

  try {
    await generateSprintBrief(sprint.rows[0] as Record<string, string | null>, tickets.rows as Record<string, unknown>[], (chunk) => stream.write(chunk));
  } catch (err) {
    stream.error((err as Error).message ?? 'Brief generation failed', 'AI_ERROR');
    return;
  }

  stream.end();
});

// ─── PATCH /sprints/:id — rename/update sprint ───────────────────────────────

router.patch('/sprints/:id', async (req: Request, res: Response) => {
  const { id } = req.params as Record<string, string>;
  const tenantId = req.user!.tenantId;
  const { name, goal } = req.body as { name?: string; goal?: string };

  const sprint = await query('SELECT id FROM sprints WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
  if (!sprint.rows[0]) { notFound(res, 'Sprint not found'); return; }

  const sets: string[] = ['updated_at = NOW()'];
  const params: unknown[] = [];
  let idx = 1;
  if (name !== undefined) { sets.push(`name = $${idx++}`); params.push(name); }
  if (goal !== undefined) { sets.push(`goal = $${idx++}`); params.push(goal); }

  params.push(id, tenantId);
  await query(`UPDATE sprints SET ${sets.join(', ')} WHERE id = $${idx++} AND tenant_id = $${idx}`, params);

  const updated = await query('SELECT * FROM sprints WHERE id = $1', [id]);
  ok(res, updated.rows[0]);
});

// ─── POST /from-roadmap/:id — one-click create sprint ticket from roadmap item

router.post('/from-roadmap/:id', async (req: Request, res: Response) => {
  const { id: roadmapItemId } = req.params as Record<string, string>;
  const tenantId = req.user!.tenantId;

  const rmRes = await query(
    'SELECT id, title, description, product_area_id FROM roadmap_items WHERE id = $1 AND tenant_id = $2 LIMIT 1',
    [roadmapItemId, tenantId]
  );
  if (!rmRes.rows[0]) { notFound(res, 'Roadmap item not found'); return; }
  const rm = rmRes.rows[0] as Record<string, string | null>;

  // Find latest open sprint or create one
  let sprintId: string;
  const existingSprint = await query(
    `SELECT id FROM sprints WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [tenantId]
  );
  if (existingSprint.rows[0]) {
    sprintId = existingSprint.rows[0].id as string;
  } else {
    sprintId = uuidv4();
    const today = new Date();
    const end = new Date(today); end.setDate(today.getDate() + 14);
    await query(
      'INSERT INTO sprints (id, tenant_id, product_area_id, name, goal, start_date, end_date) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [sprintId, tenantId, rm.product_area_id, `Sprint ${today.toISOString().slice(0, 10)}`,
       'Auto-created sprint', today.toISOString().slice(0, 10), end.toISOString().slice(0, 10)]
    );
  }

  // Deduplicate: skip if a ticket for this roadmap item already exists in this sprint
  const existingTicket = await query(
    'SELECT id FROM sprint_tickets WHERE roadmap_item_id = $1 AND sprint_id = $2 AND tenant_id = $3 LIMIT 1',
    [roadmapItemId, sprintId, tenantId]
  );
  if (existingTicket.rows[0]) {
    ok(res, { ticketId: existingTicket.rows[0].id as string, sprintId, title: `[STORY] ${rm.title}`, alreadyExists: true }, 200);
    return;
  }

  const ticketId = uuidv4();
  await query(
    `INSERT INTO sprint_tickets (id, tenant_id, product_area_id, sprint_id, roadmap_item_id, title, description, type, status, story_points, acceptance_criteria, needs_grooming)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'story','todo',5,$8,0)`,
    [ticketId, tenantId, rm.product_area_id, sprintId, roadmapItemId,
     `[STORY] ${rm.title}`, rm.description ?? '',
     JSON.stringify([`Implement solution for: ${rm.title}`, 'All existing tests pass', 'PM has verified the implementation'])]
  );

  // Move roadmap item to "planned" status
  await query(
    `UPDATE roadmap_items SET status = 'planned', updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
    [roadmapItemId, tenantId]
  );

  ok(res, { ticketId, sprintId, title: `[STORY] ${rm.title}` }, 201);
});

// ─── PATCH /tickets/:id — update ticket fields ───────────────────────────────

router.patch('/tickets/:id', async (req: Request, res: Response) => {
  const { id } = req.params as Record<string, string>;
  const tenantId = req.user!.tenantId;

  const ticket = await query(
    'SELECT id FROM sprint_tickets WHERE id = $1 AND tenant_id = $2 LIMIT 1',
    [id, tenantId]
  );
  if (!ticket.rows[0]) { notFound(res, 'Ticket not found'); return; }

  const { title, description, story_points, acceptance_criteria, needs_grooming, grooming_notes, sprint_id } = req.body as Record<string, unknown>;

  const sets: string[] = ['updated_at = NOW()'];
  const params: unknown[] = [];
  let idx = 1;
  const add = (col: string, val: unknown) => { sets.push(`${col} = $${idx++}`); params.push(val); };

  if (title !== undefined) add('title', title);
  if (description !== undefined) add('description', description);
  if (story_points !== undefined) add('story_points', story_points);
  if (acceptance_criteria !== undefined) add('acceptance_criteria', typeof acceptance_criteria === 'string' ? acceptance_criteria : JSON.stringify(acceptance_criteria));
  if (needs_grooming !== undefined) add('needs_grooming', needs_grooming ? 1 : 0);
  if (grooming_notes !== undefined) add('grooming_notes', grooming_notes);
  if (sprint_id !== undefined) add('sprint_id', sprint_id);

  params.push(id, tenantId);
  await query(`UPDATE sprint_tickets SET ${sets.join(', ')} WHERE id = $${idx++} AND tenant_id = $${idx}`, params);

  const updated = await query('SELECT * FROM sprint_tickets WHERE id = $1', [id]);
  ok(res, updated.rows[0]);
});

// ─── PATCH /tickets/:id/status — update ticket status + sync roadmap ─────────

router.patch('/tickets/:id/status', async (req: Request, res: Response) => {
  const { id } = req.params as Record<string, string>;
  const tenantId = req.user!.tenantId;

  const { status } = req.body as { status: string };
  const VALID = ['todo', 'in_progress', 'done', 'blocked'];
  if (!VALID.includes(status)) { badRequest(res, `status must be one of: ${VALID.join(', ')}`); return; }

  const ticket = await query(
    'SELECT id, roadmap_item_id FROM sprint_tickets WHERE id = $1 AND tenant_id = $2 LIMIT 1',
    [id, tenantId]
  );
  if (!ticket.rows[0]) { notFound(res, 'Ticket not found'); return; }

  await query('UPDATE sprint_tickets SET status = $1, updated_at = NOW() WHERE id = $2', [status, id]);

  // Sync roadmap item status
  const roadmapItemId = ticket.rows[0].roadmap_item_id as string | null;
  if (roadmapItemId) {
    const roadmapStatus = status === 'done' ? 'done' : status === 'in_progress' ? 'in_progress' : 'planned';
    await query(
      'UPDATE roadmap_items SET status = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3',
      [roadmapStatus, roadmapItemId, tenantId]
    );
  }

  ok(res, { id, status, roadmapItemId });
});

// ─── POST /groom — backlog grooming ──────────────────────────────────────────

router.post('/groom', requireRole('PM', 'Scrum Master'), async (req: Request, res: Response) => {
  const parsed = GroomSchema.safeParse(req.body);
  if (!parsed.success) {
    badRequest(res, parsed.error.issues.map((i) => i.message).join('; '));
    return;
  }

  const tenantId = req.user!.tenantId;

  try {
    // TODO: call AG-05 (groom mode) via orchestration layer
    const flagged = await groomBacklog(tenantId, parsed.data.sprintId);
    ok(res, { flagged });
  } catch (err) {
    ok(res, {
      flagged: [],
      message: 'Grooming AI stub — AG-05 not yet implemented',
    });
  }
});

export default router;
