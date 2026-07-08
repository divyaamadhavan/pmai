import { Router, Request, Response } from 'express';
import { query } from '../../db/index.js';
import { requireAuth } from '../../middleware/auth.js';
import { ok } from '../../lib/response.js';

const router = Router();
router.use(requireAuth);

router.get('/stats', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId;
  const { productAreaId } = req.query as { productAreaId?: string };

  const areaFilter = productAreaId ? ` AND product_area_id = '${productAreaId.replace(/'/g, "''")}'` : '';

  const [feedbackResult, sentimentResult, themesResult, documentsResult] = await Promise.all([
    query(
      `SELECT COUNT(*) AS total,
              COUNT(CASE WHEN received_at >= datetime('now', '-30 days') THEN 1 END) AS last_30_days
       FROM feedback_items
       WHERE tenant_id = $1 AND is_noise = 0${areaFilter}`,
      [tenantId]
    ),
    query(
      `SELECT sentiment, COUNT(*) AS count
       FROM feedback_items
       WHERE tenant_id = $1 AND is_noise = 0${areaFilter}
       GROUP BY sentiment`,
      [tenantId]
    ),
    query(
      `SELECT id, name, item_count
       FROM feedback_themes
       WHERE tenant_id = $1${areaFilter}
       ORDER BY item_count DESC
       LIMIT 5`,
      [tenantId]
    ),
    query(
      `SELECT COUNT(*) AS total
       FROM documents
       WHERE tenant_id = $1${areaFilter}`,
      [tenantId]
    ),
  ]);

  const sentimentMap: Record<string, number> = { positive: 0, neutral: 0, negative: 0 };
  for (const row of sentimentResult.rows) {
    sentimentMap[row.sentiment as string] = parseInt(row.count as string, 10);
  }

  ok(res, {
    feedback: {
      total: parseInt(feedbackResult.rows[0].total as string, 10),
      last30Days: parseInt(feedbackResult.rows[0].last_30_days as string, 10),
    },
    sentiment: sentimentMap,
    topThemes: themesResult.rows,
    documents: { total: parseInt(documentsResult.rows[0].total as string, 10) },
  });
});

export default router;
