import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { requireAuth } from '../../middleware/auth.js';
import { createSSEStream } from '../../lib/sse.js';
import { ok, badRequest } from '../../lib/response.js';
import { query } from '../../db/index.js';

const router = Router();
router.use(requireAuth);

// ─── Shared DB helpers ────────────────────────────────────────────────────────

async function getFeedbackRows(tenantId: string, productAreaId?: string) {
  const rows = await query(
    `SELECT id, body, channel, sentiment, received_at FROM feedback_items
     WHERE tenant_id = ? ${productAreaId ? 'AND product_area_id = ?' : ''}
     ORDER BY received_at DESC LIMIT 200`,
    productAreaId ? [tenantId, productAreaId] : [tenantId]
  );
  return rows.rows as Array<Record<string, unknown>>;
}

async function getThemeRows(tenantId: string, productAreaId?: string) {
  const rows = await query(
    `SELECT id, name, item_count FROM feedback_themes
     WHERE tenant_id = ? ${productAreaId ? 'AND product_area_id = ?' : ''}
     ORDER BY item_count DESC`,
    productAreaId ? [tenantId, productAreaId] : [tenantId]
  );
  return rows.rows as Array<Record<string, unknown>>;
}

async function getRoadmapRows(tenantId: string, productAreaId?: string) {
  const rows = await query(
    `SELECT id, title, description, status, created_at, updated_at FROM roadmap_items
     WHERE tenant_id = ? ${productAreaId ? 'AND product_area_id = ?' : ''}
     ORDER BY created_at DESC`,
    productAreaId ? [tenantId, productAreaId] : [tenantId]
  );
  return rows.rows as Array<Record<string, unknown>>;
}

async function getSprintTicketRows(tenantId: string, productAreaId?: string) {
  const rows = await query(
    `SELECT id, title, description, status, story_points, acceptance_criteria, needs_grooming, created_at
     FROM sprint_tickets
     WHERE tenant_id = ? ${productAreaId ? 'AND product_area_id = ?' : ''}
     ORDER BY created_at DESC LIMIT 100`,
    productAreaId ? [tenantId, productAreaId] : [tenantId]
  );
  return rows.rows as Array<Record<string, unknown>>;
}

// ─── Mock AI helpers ──────────────────────────────────────────────────────────

const CATEGORIES = ['Bug', 'Feature Request', 'Performance', 'UX/Usability', 'Pricing', 'Documentation', 'Integration'];
const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'];

function scoreFeedback(content: string, i: number) {
  const lower = (content ?? '').toLowerCase();
  const isCritical = ['crash', 'broken', 'error', 'fail', 'cannot', 'data loss'].some((k) => lower.includes(k));
  const isHigh     = ['slow', 'bug', 'missing', 'frustrat', 'issue', 'problem'].some((k) => lower.includes(k));
  const priority   = isCritical ? 'Critical' : isHigh ? 'High' : PRIORITIES[(i + 2) % 4];
  const impact     = isCritical ? 90 : isHigh ? 72 : 40 + (i % 30);
  const urgency    = isCritical ? 88 : isHigh ? 68 : 35 + (i % 25);
  const composite  = Math.round(impact * 0.6 + urgency * 0.4);
  const category   = CATEGORIES[i % CATEGORIES.length];
  return { priority, impact, urgency, composite, category };
}

async function streamText(text: string, onChunk: (c: string) => void): Promise<void> {
  const words = text.split(' ');
  for (const word of words) {
    onChunk(word + ' ');
    await new Promise((r) => setTimeout(r, 12));
  }
}

// ─── POST /api/agents/feedback-monitor ───────────────────────────────────────

router.post('/feedback-monitor', async (req: Request, res: Response) => {
  const schema = z.object({ productAreaId: z.string().uuid().optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { badRequest(res, 'Invalid params'); return; }

  const tenantId = req.user!.tenantId;
  const rows = await getFeedbackRows(tenantId, parsed.data.productAreaId);

  const classified = rows.map((r, i) => {
    const { priority, impact, urgency, composite, category } = scoreFeedback(String(r.body ?? ''), i);
    return {
      id: String(r.id),
      category,
      priority,
      impactScore: impact,
      urgencyScore: urgency,
      compositeScore: composite,
      tags: [category.toLowerCase().replace(/\//g, '-').replace(/\s+/g, '-')],
      oneLineSummary: String(r.body ?? '').slice(0, 80),
      reasoning: `Classified as ${category} with ${priority} priority based on content signals.`,
    };
  });

  const categoryBreakdown: Record<string, number> = {};
  for (const c of classified) {
    categoryBreakdown[c.category] = (categoryBreakdown[c.category] ?? 0) + 1;
  }

  const criticalItems = classified.filter((c) => c.priority === 'Critical').map((c) => c.id);
  const highItems     = classified.filter((c) => c.priority === 'High').map((c) => c.id);

  // Write enrichment back to each feedback item
  for (const c of classified) {
    await query(
      `UPDATE feedback_items SET agent_category = ?, agent_priority = ?, agent_composite_score = ? WHERE id = ?`,
      [c.category, c.priority, c.compositeScore, c.id]
    );
  }

  ok(res, {
    totalReceived: rows.length,
    totalActionable: classified.length,
    classification: {
      classified,
      categoryBreakdown,
      avgCompositeScore: classified.length
        ? Math.round(classified.reduce((s, c) => s + c.compositeScore, 0) / classified.length)
        : 0,
    },
    criticalItems,
    highItems,
    agentNote: rows.length === 0
      ? 'No feedback found. Upload feedback in the Feedback Hub first.'
      : `Classified ${classified.length} item(s). ${criticalItems.length} critical, ${highItems.length} high priority. Enrichment written to Feedback Hub.`,
  });
});

// ─── POST /api/agents/triage ──────────────────────────────────────────────────

router.post('/triage', async (req: Request, res: Response) => {
  const schema = z.object({ productAreaId: z.string().uuid().optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { badRequest(res, 'Invalid params'); return; }

  const tenantId = req.user!.tenantId;
  const themes = await getThemeRows(tenantId, parsed.data.productAreaId);
  const feedback = await getFeedbackRows(tenantId, parsed.data.productAreaId);

  const DECISIONS = ['Move to Backlog', 'Monitor', 'Move to Backlog', 'Escalate', 'Reject'] as const;

  const results = themes.slice(0, 8).map((t, i) => {
    const decision = DECISIONS[i % DECISIONS.length];
    const count = Number(t.item_count ?? 0);
    const impactLevel = count > 30 ? 'High' : count > 10 ? 'Medium' : 'Low';
    return {
      feedbackId: String(t.id),
      feedbackSummary: String(t.name),
      stakeholderVotes: [
        {
          role: 'Engineering Head',
          recommendation: decision,
          rationale: `${count} reports — ${decision === 'Move to Backlog' ? 'feasible within current capacity' : 'needs more evidence before committing'}.`,
          concerns: count > 20 ? ['High volume may indicate systemic issue'] : [],
        },
        {
          role: 'PM',
          recommendation: decision,
          rationale: `Theme "${t.name}" aligns with product goals. ${count} mentions across feedback.`,
          concerns: [],
        },
        {
          role: 'Business',
          recommendation: decision,
          rationale: `${impactLevel} business impact. ${count} customer mention(s).`,
          concerns: impactLevel === 'High' ? ['Revenue risk if unresolved'] : [],
        },
      ],
      finalDecision: decision,
      consensusRationale: `${count} feedback items, ${impactLevel} impact. Decision: ${decision}.`,
      dissent: null,
      actionItems: decision === 'Move to Backlog'
        ? [`Create backlog item for "${t.name}"`, 'Link feedback items to ticket']
        : decision === 'Escalate'
        ? [`Escalate "${t.name}" to leadership`, 'Schedule review within 48h']
        : [`Monitor "${t.name}" for recurrence`],
    };
  });

  const movedToBacklog = results.filter((r) => r.finalDecision === 'Move to Backlog').length;
  const monitored      = results.filter((r) => r.finalDecision === 'Monitor').length;
  const rejected       = results.filter((r) => r.finalDecision === 'Reject').length;
  const escalated      = results.filter((r) => r.finalDecision === 'Escalate').length;

  // Write triage decisions + full stakeholder votes back to themes
  for (const r of results) {
    await query(
      `UPDATE feedback_themes SET agent_triage_decision = ?, agent_triage_rationale = ?, agent_triage_details = ? WHERE id = ?`,
      [r.finalDecision, r.consensusRationale, JSON.stringify(r.stakeholderVotes), r.feedbackId]
    );
  }

  ok(res, {
    results,
    movedToBacklog,
    monitored,
    rejected,
    escalated,
    backlogCandidates: results.filter((r) => r.finalDecision === 'Move to Backlog').map((r) => r.feedbackId),
    escalations:       results.filter((r) => r.finalDecision === 'Escalate').map((r) => r.feedbackId),
    agentNote: results.length === 0
      ? 'No feedback themes found. Run the Feedback Hub pipeline to generate themes first.'
      : `Triaged ${results.length} theme(s). ${movedToBacklog} moving to backlog, ${escalated} escalated. Decisions written to Feedback Hub.`,
  });
});

// ─── POST /api/agents/roadmap-health ─────────────────────────────────────────

router.post('/roadmap-health', async (req: Request, res: Response) => {
  const schema = z.object({
    staleThresholdDays: z.number().int().min(1).default(30),
    productAreaId: z.string().uuid().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { badRequest(res, 'Invalid params'); return; }

  const tenantId = req.user!.tenantId;
  const items = await getRoadmapRows(tenantId, parsed.data.productAreaId);
  const threshold = parsed.data.staleThresholdDays ?? 30;
  const now = Date.now();

  const reports = items.map((item) => {
    const updatedAt  = new Date(String(item.updated_at ?? item.created_at ?? new Date())).getTime();
    const createdAt  = new Date(String(item.created_at ?? new Date())).getTime();
    const daysNoActivity = Math.floor((now - updatedAt) / 86_400_000);
    const daysOnRoadmap  = Math.floor((now - createdAt) / 86_400_000);
    const daysNoTicket   = daysNoActivity; // simplified — no sprint_ticket join yet

    const risk: 'Critical' | 'High' | 'Medium' | 'Low' =
      daysNoTicket > 90 ? 'Critical' : daysNoTicket > 60 ? 'High' : daysNoTicket > 30 ? 'Medium' : 'Low';

    const recommendation: 'Create Sprint Ticket' | 'Reassess Priority' | 'Archive' | 'Needs Owner' | 'OK' =
      daysNoTicket > 90 ? 'Reassess Priority'
      : daysNoTicket > 30 ? 'Create Sprint Ticket'
      : 'OK';

    return {
      itemId: String(item.id),
      title: String(item.title),
      daysWithoutActivity: daysNoActivity,
      daysWithoutSprintTicket: daysNoTicket,
      daysOnRoadmap,
      stalenessRisk: risk,
      recommendation,
      actionPrompt: recommendation === 'Create Sprint Ticket'
        ? `Create a sprint ticket for "${item.title}" — it has been on the roadmap for ${daysNoTicket} days with no ticket.`
        : recommendation === 'Reassess Priority'
        ? `"${item.title}" is ${daysNoTicket} days old with no sprint ticket — reassess or archive.`
        : `"${item.title}" is healthy.`,
      blockers: [],
    };
  });

  const staleCount    = reports.filter((r) => r.daysWithoutSprintTicket > threshold).length;
  const criticalCount = reports.filter((r) => r.stalenessRisk === 'Critical').length;
  const healthScore   = items.length
    ? Math.max(0, Math.round(100 - (staleCount / items.length) * 100))
    : 100;

  const alertSummary = criticalCount > 0
    ? `⚠ ${criticalCount} critical item(s) have been on the roadmap for over ${threshold} days with no sprint ticket.`
    : staleCount > 0
    ? `${staleCount} roadmap item(s) are stale and need sprint tickets.`
    : 'Roadmap is healthy — all items have recent activity.';

  ok(res, {
    reports,
    staleItemCount: staleCount,
    criticalCount,
    healthScore,
    topRecommendations: [
      ...reports.filter((r) => r.recommendation === 'Create Sprint Ticket').slice(0, 2).map((r) => r.actionPrompt),
      ...reports.filter((r) => r.recommendation === 'Reassess Priority').slice(0, 1).map((r) => r.actionPrompt),
    ],
    alertSummary,
    itemsNeedingTicket: reports.filter((r) => r.recommendation === 'Create Sprint Ticket').map((r) => r.title),
    itemsToArchive: reports.filter((r) => r.recommendation === 'Archive').map((r) => r.title),
    agentNote: items.length === 0
      ? 'No roadmap items found. Add items in the Roadmap board first.'
      : alertSummary,
  });
});

// ─── POST /api/agents/customer-pulse ─────────────────────────────────────────

router.post('/customer-pulse', async (req: Request, res: Response) => {
  const schema = z.object({ productAreaId: z.string().uuid().optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { badRequest(res, 'Invalid params'); return; }

  const tenantId = req.user!.tenantId;
  const [themes, roadmapItems] = await Promise.all([
    getThemeRows(tenantId, parsed.data.productAreaId),
    getRoadmapRows(tenantId, parsed.data.productAreaId),
  ]);

  const gaps = themes.slice(0, 6).map((t, i) => {
    const linked = roadmapItems.filter((r) =>
      String(r.title ?? '').toLowerCase().includes(String(t.name ?? '').toLowerCase().split(' ')[0])
    );
    const coveragePct = linked.length > 0 ? Math.min(90, 40 + linked.length * 20) : 10;
    const severity: 'Critical' | 'High' | 'Medium' | 'Low' =
      coveragePct < 20 ? 'Critical' : coveragePct < 50 ? 'High' : coveragePct < 75 ? 'Medium' : 'Low';

    return {
      id: `gap-${i}`,
      title: `Gap: ${t.name}`,
      gapType: linked.length === 0 ? 'Unaddressed Need' : 'Partial Coverage',
      severity,
      feedbackThemeIds: [String(t.id)],
      feedbackCount: Number(t.item_count ?? 0),
      relatedRoadmapItemIds: linked.map((r) => String(r.id)),
      coveragePercent: coveragePct,
      description: `${t.name} has ${t.item_count} customer mentions but ${linked.length === 0 ? 'no roadmap coverage' : 'only partial roadmap coverage'}.`,
      recommendation: linked.length === 0
        ? `Add a roadmap item to address "${t.name}".`
        : `Expand roadmap coverage for "${t.name}" — currently only ${coveragePct}% addressed.`,
      evidenceQuotes: [],
    };
  });

  const coverageScore = gaps.length
    ? Math.round(gaps.reduce((s, g) => s + g.coveragePercent, 0) / gaps.length)
    : 100;

  const criticalGapCount  = gaps.filter((g) => g.severity === 'Critical').length;
  const unaddressedCount  = gaps.filter((g) => g.gapType === 'Unaddressed Need').length;
  const alertLevel        = criticalGapCount >= 2 ? 'Critical' : coverageScore < 60 ? 'Warning' : 'Healthy';

  const result = {
    gaps,
    coverageScore,
    criticalGapCount,
    totalFeedbackUnaddressed: gaps.reduce((s, g) => s + g.feedbackCount, 0),
    executiveSummary: `Customer coverage score is ${coverageScore}/100. ${criticalGapCount} critical gap(s) where customer needs have no roadmap coverage. Top unaddressed area: ${gaps[0]?.title ?? 'N/A'}.`,
    topGaps: gaps.slice(0, 3).map((g) => g.title),
    themes: themes.slice(0, 6).map((t) => ({ id: String(t.id), name: String(t.name), count: Number(t.item_count) })),
    alertLevel,
    nudge: alertLevel === 'Critical'
      ? `${criticalGapCount} critical customer needs are unaddressed — add them to the roadmap.`
      : alertLevel === 'Warning'
      ? `Coverage is ${coverageScore}% — review top gaps before next planning cycle.`
      : `Customer coverage looks good at ${coverageScore}%. Keep monitoring for shifts.`,
    agentNote: themes.length === 0
      ? 'No themes found. Run feedback analysis in Feedback Hub first.'
      : `Analysed ${themes.length} theme(s) vs ${roadmapItems.length} roadmap item(s). ${unaddressedCount} unaddressed need(s).`,
  };

  // Persist snapshot so Feedback Hub banner only shows after a manual run
  await query(
    `INSERT INTO agent_snapshots (id, tenant_id, agent_type, result_json) VALUES (lower(hex(randomblob(16))), ?, 'customer-pulse', ?)`,
    [tenantId, JSON.stringify({ alertLevel, coverageScore, criticalGapCount, topGaps: result.topGaps, nudge: result.nudge })]
  );

  ok(res, result);
});

// ─── GET /api/agents/latest-pulse ────────────────────────────────────────────
// Returns the most recent manually-run Customer Pulse snapshot (never auto-computes).

router.get('/latest-pulse', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId;

  const row = await query<{ result_json: string }>(
    `SELECT result_json FROM agent_snapshots WHERE tenant_id = ? AND agent_type = 'customer-pulse' ORDER BY created_at DESC LIMIT 1`,
    [tenantId]
  );

  if (row.rows.length === 0) {
    ok(res, { alertLevel: 'None', coverageScore: 0, criticalGapCount: 0, topGaps: [], nudge: '' });
    return;
  }

  try {
    const snapshot = JSON.parse(row.rows[0].result_json);
    ok(res, snapshot);
  } catch {
    ok(res, { alertLevel: 'None', coverageScore: 0, criticalGapCount: 0, topGaps: [], nudge: '' });
  }
});

// ─── POST /api/agents/conflict-resolver ──────────────────────────────────────
// Compares AI Monitor signals vs Agent Triage decisions, applies tiebreaker
// rules, and returns a final ranked verdict per theme.

router.post('/conflict-resolver', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId;

  // Pull themes with triage decisions
  const themesResult = await query(
    `SELECT id, name, item_count, agent_triage_decision, agent_triage_rationale, created_at
     FROM feedback_themes WHERE tenant_id = ? ORDER BY item_count DESC`,
    [tenantId]
  );
  const themes = themesResult.rows as Array<{
    id: string; name: string; item_count: number;
    agent_triage_decision: string | null; agent_triage_rationale: string | null;
    created_at: string;
  }>;

  if (themes.length === 0) {
    ok(res, { verdicts: [], conflicts: 0, message: 'No themes found. Run the Triage agent first.' });
    return;
  }

  // Pull classifications for monitor priority + category per theme
  const classResult = await query(
    `SELECT theme_name, priority, category, feedback_count FROM feedback_classifications WHERE tenant_id = ?`,
    [tenantId]
  );
  const classMap = new Map<string, { priority: string; category: string; feedback_count: number }>();
  for (const r of classResult.rows as Array<{ theme_name: string; priority: string; category: string; feedback_count: number }>) {
    classMap.set(r.theme_name, r);
  }

  // Pull negative sentiment ratio per theme (via feedback_items linked by theme name in clusters)
  const sentimentResult = await query(
    `SELECT ft.name as theme_name,
       COUNT(fi.id) as total,
       SUM(CASE WHEN fi.sentiment = 'negative' THEN 1 ELSE 0 END) as negative_count
     FROM feedback_themes ft
     LEFT JOIN feedback_clusters fc ON fc.theme_id = ft.id
     LEFT JOIN feedback_items fi ON fi.id = fc.feedback_item_id
     WHERE ft.tenant_id = ?
     GROUP BY ft.id, ft.name`,
    [tenantId]
  );
  const sentimentMap = new Map<string, number>();
  for (const r of sentimentResult.rows as Array<{ theme_name: string; total: number; negative_count: number }>) {
    const ratio = Number(r.total) > 0 ? Number(r.negative_count) / Number(r.total) : 0.5;
    sentimentMap.set(r.theme_name, ratio);
  }

  // Category weight: higher = more urgent
  const categoryWeight = (cat: string): number => {
    if (!cat) return 2;
    const c = cat.toLowerCase();
    if (c.includes('bug') || c.includes('reliab') || c.includes('security') || c.includes('compliance')) return 5;
    if (c.includes('performance')) return 4;
    if (c.includes('ux') || c.includes('usab') || c.includes('onboard')) return 3;
    if (c.includes('integration') || c.includes('billing')) return 2;
    return 1; // Feature Request
  };

  // Monitor priority weight
  const monitorWeight = (p: string): number =>
    ({ critical: 4, high: 3, medium: 2, low: 1 })[p?.toLowerCase()] ?? 0;

  // Triage weight
  const triageWeight = (d: string | null): number =>
    ({ 'Move to Backlog': 3, 'Escalate': 4, 'Monitor': 2, 'Reject': 0 })[d ?? ''] ?? 1;

  const now = Date.now();
  const MAX_AGE_DAYS = 90;

  const verdicts = themes.map(t => {
    const cls = classMap.get(t.name);
    const negRatio = sentimentMap.get(t.name) ?? 0.5;
    const catW = categoryWeight(cls?.category ?? '');
    const monW = monitorWeight(cls?.priority ?? '');
    const triW = triageWeight(t.agent_triage_decision);
    const count = Number(t.item_count);
    const ageMs = now - new Date(t.created_at).getTime();
    const recencyBoost = Math.max(0, 1 - ageMs / (MAX_AGE_DAYS * 86400000));

    // Detect conflict: monitor says critical/high but triage says monitor/reject, or vice versa
    const monitorUrgent = monW >= 3;
    const triageUrgent = triW >= 3;
    const isConflict = monitorUrgent !== triageUrgent && monW > 0 && triW > 0;

    // Composite score: count × negSentiment × catWeight × avgOfMonitor+Triage + recency
    const score = count * (0.4 + negRatio * 0.6) * catW * ((monW + triW) / 2 + 1) * (1 + recencyBoost * 0.2);

    // Build tiebreaker rationale
    let rationale = '';
    let verdict = '';
    if (isConflict) {
      // Determine winner by tiebreaker chain — verdict is a PM ACTION, not a priority label
      if (negRatio >= 0.65) {
        if (monitorUrgent) {
          verdict = 'Add to Backlog';
          rationale = `${Math.round(negRatio * 100)}% of feedback is negative — this is a live pain point. Triage underweighted it due to low volume, but sentiment overrides. Add to backlog now.`;
        } else {
          verdict = 'Keep Monitoring';
          rationale = `${Math.round(negRatio * 100)}% negative sentiment, but triage correctly flagged this is not yet urgent. Watch for more feedback before committing.`;
        }
      } else if (catW >= 4) {
        verdict = 'Add to Backlog';
        rationale = `Category "${cls?.category}" carries high urgency (Bug/Security/Performance) regardless of volume. Triage's "Monitor" underweights the risk. Add to backlog.`;
      } else if (count > 5) {
        if (monitorUrgent) {
          verdict = 'Add to Backlog';
          rationale = `${count} feedback items is enough evidence to act. AI Monitor's higher priority wins — add to backlog this cycle.`;
        } else {
          verdict = 'Keep Monitoring';
          rationale = `${count} items collected but triage and sentiment both suggest low urgency. Park for now and reassess next planning cycle.`;
        }
      } else {
        verdict = 'PM Decision Needed';
        rationale = `Low volume (${count} items), mixed signals. Neither AI is confident — review the raw feedback and decide based on your product context.`;
      }
    } else {
      verdict = 'Signals Aligned';
      rationale = `AI Monitor and Triage agree. ${t.agent_triage_rationale ?? ''}`.trim();
    }

    return {
      themeId: t.id,
      themeName: t.name,
      feedbackCount: count,
      monitorPriority: cls?.priority ?? null,
      monitorCategory: cls?.category ?? null,
      triageDecision: t.agent_triage_decision,
      negSentimentPct: Math.round(negRatio * 100),
      isConflict,
      score: Math.round(score * 10) / 10,
      verdict,
      rationale,
    };
  }).sort((a, b) => b.score - a.score);

  const conflictCount = verdicts.filter(v => v.isConflict).length;

  ok(res, {
    verdicts,
    conflicts: conflictCount,
    message: conflictCount > 0
      ? `${conflictCount} conflict${conflictCount !== 1 ? 's' : ''} detected and resolved using tiebreaker rules.`
      : 'No conflicts — AI Monitor and Agent Triage are aligned across all themes.',
  });
});

// ─── POST /api/agents/triage-action ─────────────────────────────────────────
// Marks a triaged theme as actioned and optionally creates a roadmap backlog item.

router.post('/triage-action', async (req: Request, res: Response) => {
  const schema = z.object({ themeId: z.string(), themeName: z.string(), themeDescription: z.string().optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { badRequest(res, 'Invalid params'); return; }

  const tenantId = req.user!.tenantId;
  const { themeId, themeName, themeDescription } = parsed.data;

  // Create a roadmap backlog item for the theme
  const roadmapId = uuidv4();
  await query(
    `INSERT INTO roadmap_items (id, tenant_id, title, description, status, created_by) VALUES (?, ?, ?, ?, 'backlog', ?)`,
    [roadmapId, tenantId, `[Triage] ${themeName}`, themeDescription ?? `Agent-triaged theme: ${themeName}`, req.user!.id]
  );

  // Mark theme as actioned
  await query(`UPDATE feedback_themes SET agent_triage_actioned = 1 WHERE id = ? AND tenant_id = ?`, [themeId, tenantId]);

  // Sync any matching PM classification to 'backlog' so the PM Decisions section reflects the triage decision
  await query(
    `UPDATE feedback_classifications SET pm_decision = 'backlog', pm_decision_at = datetime('now'), roadmap_item_id = ?, updated_at = datetime('now')
     WHERE tenant_id = ? AND theme_name = ? AND pm_decision = 'pending'`,
    [roadmapId, tenantId, themeName]
  );

  // Mark linked feedback items as addressed (same logic as classification decision handler)
  const themeResult = await query(
    `SELECT id FROM feedback_themes WHERE tenant_id = ? AND name = ? LIMIT 1`,
    [tenantId, themeName]
  );
  if (themeResult.rows[0]) {
    const tId = (themeResult.rows[0] as Record<string, unknown>).id as string;
    const itemsInTheme = await query(
      `SELECT feedback_item_id FROM feedback_clusters WHERE theme_id = ?`,
      [tId]
    );
    for (const itemRow of itemsInTheme.rows as Array<{ feedback_item_id: string }>) {
      const fid = itemRow.feedback_item_id;
      const pendingCheck = await query(
        `SELECT COUNT(*) as cnt
         FROM feedback_clusters fc
         JOIN feedback_themes ft ON ft.id = fc.theme_id
         LEFT JOIN feedback_classifications fc2
           ON fc2.theme_name = ft.name AND fc2.tenant_id = ?
         WHERE fc.feedback_item_id = ?
           AND (fc2.pm_decision = 'pending' OR fc2.pm_decision IS NULL)`,
        [tenantId, fid]
      );
      const pendingCount = Number((pendingCheck.rows[0] as { cnt: number }).cnt);
      if (pendingCount === 0) {
        await query(
          `UPDATE feedback_items SET status = 'addressed' WHERE id = ? AND tenant_id = ?`,
          [fid, tenantId]
        );
      }
    }
  }

  ok(res, { roadmapItemId: roadmapId });
});

// ─── POST /api/agents/sprint-coach ───────────────────────────────────────────

router.post('/sprint-coach', async (req: Request, res: Response) => {
  const schema = z.object({
    sprintGoal: z.string().optional().default('Current sprint'),
    storyPointCeiling: z.number().int().min(1).optional().default(40),
    productAreaId: z.string().uuid().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { badRequest(res, 'Invalid params'); return; }

  const tenantId = req.user!.tenantId;
  const tickets  = await getSprintTicketRows(tenantId, parsed.data.productAreaId);
  const ceiling  = parsed.data.storyPointCeiling ?? 40;

  const ticketResults = tickets.map((t) => {
    const hasAC     = !!(t.acceptance_criteria && t.acceptance_criteria !== '[]' && t.acceptance_criteria !== 'null');
    const hasPoints = Number(t.story_points ?? 0) > 0;
    const tooLarge  = Number(t.story_points ?? 0) > 8;
    const needsGroom= !!t.needs_grooming;
    const hasDesc   = String(t.description ?? '').length > 20;

    const issues: Array<{ type: string; severity: string; detail: string; fix: string }> = [];

    if (!hasAC)     issues.push({ type: 'Missing AC',       severity: 'Blocker',    detail: 'No acceptance criteria found.',    fix: 'Add Given/When/Then criteria for the happy path and key edge cases.' });
    if (!hasPoints) issues.push({ type: 'No Story Points',  severity: 'Warning',    detail: 'Ticket is unestimated.',           fix: 'Estimate story points before sprint planning.' });
    if (tooLarge)   issues.push({ type: 'Too Large',        severity: 'Warning',    detail: `${t.story_points} points exceeds recommended ceiling of 8.`, fix: 'Split into 2–3 smaller tickets.' });
    if (needsGroom) issues.push({ type: 'Long in Grooming', severity: 'Warning',    detail: 'Flagged as needing grooming.',     fix: 'Schedule grooming session and clarify requirements.' });
    if (!hasDesc)   issues.push({ type: 'Missing Description', severity: 'Suggestion', detail: 'Description is too short.', fix: 'Add a clear problem statement and context.' });

    const hygieneScore = Math.max(0, 100 - issues.filter((i) => i.severity === 'Blocker').length * 40 - issues.filter((i) => i.severity === 'Warning').length * 15 - issues.filter((i) => i.severity === 'Suggestion').length * 5);

    return {
      ticketId: String(t.id),
      title: String(t.title),
      isHealthy: issues.length === 0,
      issues,
      hygieneScore,
    };
  });

  const sprintHealthScore = ticketResults.length
    ? Math.round(ticketResults.reduce((s, r) => s + r.hygieneScore, 0) / ticketResults.length)
    : 100;

  const blockerCount  = ticketResults.reduce((s, r) => s + r.issues.filter((i) => i.severity === 'Blocker').length, 0);
  const warningCount  = ticketResults.reduce((s, r) => s + r.issues.filter((i) => i.severity === 'Warning').length, 0);
  const readyCount    = ticketResults.filter((r) => r.isHealthy).length;
  const needsWorkIds  = ticketResults.filter((r) => !r.isHealthy).map((r) => r.ticketId);
  const readyIds      = ticketResults.filter((r) => r.isHealthy).map((r) => r.ticketId);

  const totalPoints  = tickets.reduce((s, t) => s + Number(t.story_points ?? 0), 0);
  const coachingNotes = [
    blockerCount > 0 ? `${blockerCount} ticket(s) have missing acceptance criteria — resolve before sprint start.` : null,
    totalPoints > ceiling ? `Total points (${totalPoints}) exceeds ceiling (${ceiling}) — consider descoping.` : null,
    tickets.length === 0 ? 'No tickets found in the sprint. Add stories from the Roadmap board.' : null,
    readyCount === tickets.length && tickets.length > 0 ? 'All tickets are healthy and ready for sprint planning.' : null,
  ].filter(Boolean) as string[];

  const topFixActions = [
    ...ticketResults.filter((r) => r.issues.some((i) => i.severity === 'Blocker')).slice(0, 3).map((r) => `Add acceptance criteria to "${r.title}"`),
    ...ticketResults.filter((r) => r.issues.some((i) => i.type === 'Too Large')).slice(0, 2).map((r) => `Split "${r.title}" into smaller tickets`),
  ].slice(0, 3);

  ok(res, {
    hygiene: { ticketResults, sprintHealthScore, blockerCount, warningCount, readyCount, coachingNotes, topFixActions },
    groomingFlags: ticketResults.map((r) => ({
      ticketId: r.ticketId,
      status: r.isHealthy ? 'READY' : r.issues.some((i) => i.severity === 'Blocker') ? 'MISSING_AC' : 'AMBIGUOUS',
      suggestion: r.issues[0]?.fix,
    })),
    sprintReadinessScore: sprintHealthScore,
    readyForSprint: readyIds,
    needsWork: needsWorkIds,
    coachSummary: coachingNotes[0] ?? `Sprint health: ${sprintHealthScore}/100. ${readyCount}/${tickets.length} tickets ready.`,
    agentNote: tickets.length === 0
      ? 'No sprint tickets found. Create a sprint and add tickets in Sprint Planner.'
      : `Reviewed ${tickets.length} ticket(s). Sprint health: ${sprintHealthScore}/100.`,
  });
});

// ─── POST /api/agents/prd-drafter ────────────────────────────────────────────

router.post('/prd-drafter', async (req: Request, res: Response) => {
  const schema = z.object({
    roadmapItemId: z.string().uuid().optional(),
    productScope: z.string().optional().default('Core Product'),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { badRequest(res, 'Invalid params'); return; }

  const tenantId = req.user!.tenantId;

  // Pick the roadmap item: explicit id or most recently planned, else most recently updated
  let itemRow: Record<string, unknown> | null = null;
  if (parsed.data.roadmapItemId) {
    const r = await query(
      'SELECT id, title, description, status FROM roadmap_items WHERE id = ? AND tenant_id = ?',
      [parsed.data.roadmapItemId, tenantId]
    );
    itemRow = (r.rows[0] ?? null) as Record<string, unknown> | null;
  } else {
    const r = await query(
      `SELECT id, title, description, status FROM roadmap_items WHERE tenant_id = ?
       ORDER BY CASE WHEN status = 'planned' THEN 0 ELSE 1 END, updated_at DESC LIMIT 1`,
      [tenantId]
    );
    itemRow = (r.rows[0] ?? null) as Record<string, unknown> | null;
  }

  if (!itemRow) {
    ok(res, { data: { title: null, linkedThemeCount: 0, generatedAt: null, skipped: true, reason: 'No roadmap items found. Please add a roadmap item first.' } });
    return;
  }

  // Check if a PRD already exists for this roadmap item title
  const itemTitle = String(itemRow.title);
  const existingPrd = await query(
    `SELECT id, title FROM documents WHERE tenant_id = ? AND type = 'PRD' AND (title = ? OR title = ?) LIMIT 1`,
    [tenantId, `PRD Draft: ${itemTitle}`, itemTitle]
  );
  if (existingPrd.rows.length > 0) {
    ok(res, { data: { title: itemTitle, linkedThemeCount: 0, generatedAt: null, skipped: true, reason: `PRD already exists for "${itemTitle}". Open Documents to view it.` } });
    return;
  }

  const themes = await getThemeRows(tenantId);
  const linkedThemes = themes.slice(0, 3).map((t) => String(t.name));
  const title  = String(itemRow.title);
  const desc   = String(itemRow.description ?? '');
  const scope  = parsed.data.productScope ?? 'Core Product';

  const prdContent = `# PRD Draft — ${title}

> **Status:** Draft — auto-generated by PMAI Agent AG-12. Review and edit before sharing.
> **Generated:** ${new Date().toLocaleString()}
> **Product Scope:** ${scope}

---

## Executive Summary

This PRD covers the requirements for **${title}**. ${desc || 'This feature was identified as a priority from customer feedback and strategic planning.'}

${linkedThemes.length > 0 ? `Evidence from **${linkedThemes.length} feedback theme(s)**: ${linkedThemes.join(', ')}.` : ''}

---

## Problem Statement

Customers are experiencing friction in this area of the product. Based on collected feedback, this represents a significant opportunity to improve product value and reduce churn.

[PM TO COMPLETE: Add specific customer quotes and data points here.]

---

## Goals & Success Metrics

| Goal | Metric | Target |
|------|--------|--------|
| Improve user satisfaction | NPS / CSAT | +10 points |
| Reduce support tickets | Ticket volume for this area | -30% |
| Drive adoption | Feature usage rate | >40% of DAU |

[PM TO COMPLETE: Add specific OKR alignment.]

---

## User Personas & Jobs-to-be-Done

**Primary Persona:** Product Manager / Team Lead
- **JTBD:** I need to ${desc.slice(0, 60) || 'accomplish this goal'} so that my team can work more efficiently.

[PM TO COMPLETE: Add secondary personas and additional JTBD statements.]

---

## Functional Requirements

### FR-01: Core Functionality
- [ASSUMPTION] Feature will be built as an extension of the existing product surface
- Users must be able to perform the primary action within 3 clicks
- System must respond within 2 seconds for all primary actions

### FR-02: Integration
- Must integrate with existing data model
- Must respect tenant-level permissions

[PM TO COMPLETE: Add detailed functional requirements from engineering discussions.]

---

## Non-Functional Requirements

- **Performance:** p95 response time < 200ms
- **Availability:** 99.9% uptime SLA
- **Security:** Follows existing RBAC model; no new permissions needed
- **Accessibility:** WCAG 2.1 AA compliant

---

## Out of Scope (Phase 1)

- Mobile native experience
- Bulk operations
- Third-party integrations (deferred to Phase 2)

---

## Dependencies

- Engineering estimate required before sprint planning
- Design mockups must be approved before development starts

---

## Timeline & Milestones

| Milestone | Target |
|-----------|--------|
| PRD Approved | [PM TO COMPLETE] |
| Design Done | [PM TO COMPLETE] |
| Engineering Start | [PM TO COMPLETE] |
| Beta Release | [PM TO COMPLETE] |
| GA Release | [PM TO COMPLETE] |

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Scope creep | Medium | High | Lock scope after PRD approval |
| Engineering capacity | Medium | Medium | Align with sprint capacity in planning |

---

## Open Questions

1. [PM TO COMPLETE] What is the exact scope for Phase 1 vs Phase 2?
2. [PM TO COMPLETE] Are there any compliance or legal considerations?
3. [PM TO COMPLETE] Who is the engineering lead for this feature?

---

*Auto-drafted by PMAI Agent AG-12 · PRD Drafter. Linked themes: ${linkedThemes.join(', ') || 'none'}. This document requires PM review and approval before sharing with engineering.*`;

  // Persist to documents table and return JSON (no SSE — AgentCenter uses apiClient.post)
  const userId = req.user!.id;
  await query(
    `INSERT INTO documents (id, tenant_id, created_by, title, type, status, sections, metadata, created_at, updated_at)
     VALUES (lower(hex(randomblob(16))), ?, ?, ?, 'PRD', 'draft', ?, '{}', datetime('now'), datetime('now'))`,
    [tenantId, userId, `PRD Draft: ${title}`, JSON.stringify({ content: prdContent })]
  );

  ok(res, { data: { title, linkedThemeCount: linkedThemes.length, generatedAt: new Date().toISOString() } });
});

export default router;
