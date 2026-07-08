import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../../db/index.js';
import { requireAuth } from '../../middleware/auth.js';
import { ok, badRequest, notFound } from '../../lib/response.js';

const router = Router();
router.use(requireAuth);

const CreateProjectSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
});

const UpdateProjectSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
});

// GET /api/projects — list all projects for the tenant
router.get('/', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId;
  const result = await query(
    `SELECT id, name, description, created_at, updated_at
     FROM product_areas
     WHERE tenant_id = $1
     ORDER BY created_at ASC`,
    [tenantId]
  );
  ok(res, { projects: result.rows });
});

// POST /api/projects — create a new project
router.post('/', async (req: Request, res: Response) => {
  const parsed = CreateProjectSchema.safeParse(req.body);
  if (!parsed.success) {
    badRequest(res, parsed.error.issues.map((i) => i.message).join('; '));
    return;
  }
  const tenantId = req.user!.tenantId;
  const { name, description } = parsed.data;
  const id = uuidv4();

  await query(
    `INSERT INTO product_areas (id, tenant_id, name, description) VALUES ($1, $2, $3, $4)`,
    [id, tenantId, name, description ?? null]
  );

  const result = await query(
    `SELECT id, name, description, created_at FROM product_areas WHERE id = $1`,
    [id]
  );
  ok(res, { project: result.rows[0] }, 201);
});

// PUT /api/projects/:id — update a project
router.put('/:id', async (req: Request, res: Response) => {
  const { id } = req.params as Record<string, string>;
  const tenantId = req.user!.tenantId;

  const existing = await query(
    `SELECT id FROM product_areas WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
    [id, tenantId]
  );
  if (!existing.rows[0]) { notFound(res, 'Project not found'); return; }

  const parsed = UpdateProjectSchema.safeParse(req.body);
  if (!parsed.success) { badRequest(res, parsed.error.issues.map((i) => i.message).join('; ')); return; }

  const { name, description } = parsed.data;
  const updates: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (name !== undefined) { updates.push(`name = $${idx++}`); params.push(name); }
  if (description !== undefined) { updates.push(`description = $${idx++}`); params.push(description); }
  updates.push(`updated_at = datetime('now')`);
  params.push(id, tenantId);

  await query(
    `UPDATE product_areas SET ${updates.join(', ')} WHERE id = $${idx++} AND tenant_id = $${idx}`,
    params
  );

  const result = await query(`SELECT id, name, description, created_at, updated_at FROM product_areas WHERE id = $1`, [id]);
  ok(res, { project: result.rows[0] });
});

// DELETE /api/projects/:id — delete a project (only if it has no data)
router.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params as Record<string, string>;
  const tenantId = req.user!.tenantId;

  const existing = await query(
    `SELECT id FROM product_areas WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
    [id, tenantId]
  );
  if (!existing.rows[0]) { notFound(res, 'Project not found'); return; }

  // Count all data attached to this project
  const counts = await query(
    `SELECT
       (SELECT COUNT(*) FROM feedback_items WHERE product_area_id = $1) AS feedback,
       (SELECT COUNT(*) FROM documents WHERE product_area_id = $1) AS documents,
       (SELECT COUNT(*) FROM roadmap_items WHERE product_area_id = $1) AS roadmap`,
    [id]
  );
  const row = counts.rows[0] as { feedback: number; documents: number; roadmap: number };
  const total = Number(row.feedback) + Number(row.documents) + Number(row.roadmap);
  if (total > 0) {
    badRequest(res, `Cannot delete project — it has ${total} item(s) attached. Archive or reassign them first.`);
    return;
  }

  await query(`DELETE FROM product_areas WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
  ok(res, { deleted: id });
});

export default router;
