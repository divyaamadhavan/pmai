/**
 * Auto-pipeline: runs after feedback upload approval.
 * Generates themes → opportunities → PRD → User Stories → AC → Roadmap → Sprint + tickets.
 */
import { v4 as uuidv4 } from 'uuid';
import { query } from '../../db/index.js';
import { generateDocumentText } from '../../ai/index.js';

export type ProgressCallback = (step: string, message: string) => void;

interface PipelineInput {
  tenantId: string;
  productAreaId: string | null;
  userId: string;
  themes: string[];
  themeCounts: number[];
  feedbackCount: number;
  /** Optional overrides from user approval step */
  prdTitle?: string;
  sprintName?: string;
}

interface PipelineResult {
  prdId: string;
  usId: string;
  acId: string;
  sprintId: string;
  opportunityIds: string[];
  roadmapIds: string[];
}

export async function runFeedbackPipeline(
  input: PipelineInput,
  onProgress?: ProgressCallback
): Promise<PipelineResult> {
  const { tenantId, productAreaId, userId, themes, themeCounts, feedbackCount } = input;
  const progress = (step: string, msg: string) => {
    console.log(`[pipeline] ${step}: ${msg}`);
    onProgress?.(step, msg);
  };

  // ── 1. Store / update feedback themes ──────────────────────────────────────
  progress('themes', `Storing ${themes.length} theme(s)…`);
  const themeIds: string[] = [];
  for (let i = 0; i < themes.length; i++) {
    const existing = await query(
      'SELECT id FROM feedback_themes WHERE tenant_id = $1 AND name = $2 LIMIT 1',
      [tenantId, themes[i]]
    );
    if (existing.rows[0]) {
      const id = existing.rows[0].id as string;
      await query('UPDATE feedback_themes SET item_count = item_count + $1 WHERE id = $2', [themeCounts[i], id]);
      themeIds.push(id);
    } else {
      const id = uuidv4();
      await query(
        'INSERT INTO feedback_themes (id, tenant_id, product_area_id, name, item_count) VALUES ($1, $2, $3, $4, $5)',
        [id, tenantId, productAreaId, themes[i], themeCounts[i]]
      );
      themeIds.push(id);
    }
  }

  // ── 2. Create Opportunities (feeds Insights Explorer) ──────────────────────
  progress('opportunities', `Creating ${themes.length} opportunity record(s)…`);
  const opportunityIds: string[] = [];
  for (let i = 0; i < themes.length; i++) {
    const oppId = uuidv4();
    const impactScore = Math.max(0.3, 1 - i * 0.1);
    const effortScore = 0.4 + (i % 3) * 0.15;
    const priorityScore = impactScore / effortScore;
    await query(
      `INSERT INTO opportunities (id, tenant_id, product_area_id, title, description, evidence, impact_score, effort_score, priority_score)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        oppId, tenantId, productAreaId,
        `Resolve: ${themes[i]}`,
        `Customer feedback identified "${themes[i]}" as a recurring pain point across ${themeCounts[i]} item(s). Addressing this will directly improve customer satisfaction and retention.`,
        JSON.stringify([`${themeCounts[i]} feedback item(s) mention this theme`, `Detected via automated analysis of ${feedbackCount} total feedback items`]),
        impactScore, effortScore, priorityScore,
      ]
    );
    opportunityIds.push(oppId);
  }

  // ── 3. Generate PRD ────────────────────────────────────────────────────────
  const prdTitle = input.prdTitle ?? `Product Requirements — ${themes.slice(0, 2).join(' & ')}`;
  progress('prd', `Generating PRD: "${prdTitle}"…`);
  const feedbackSummary = `${feedbackCount} feedback items across ${themes.length} theme(s)`;
  const prdContent = await generateDocumentText({
    type: 'PRD', context: { title: prdTitle, themes, feedbackSummary }, tenantId, productAreaId: productAreaId ?? undefined,
  });
  const prdId = uuidv4();
  await query(
    `INSERT INTO documents (id, tenant_id, product_area_id, created_by, title, type, status, sections) VALUES ($1,$2,$3,$4,$5,'PRD','draft',$6)`,
    [prdId, tenantId, productAreaId, userId, prdTitle, JSON.stringify({ content: prdContent })]
  );

  // ── 4. Generate User Stories ───────────────────────────────────────────────
  const usTitle = `User Stories — ${themes.slice(0, 2).join(' & ')}`;
  progress('user_stories', `Generating User Stories…`);
  const usContent = await generateDocumentText({
    type: 'UserStory', context: { title: usTitle, themes, feedbackSummary }, tenantId, productAreaId: productAreaId ?? undefined,
  });
  const usId = uuidv4();
  await query(
    `INSERT INTO documents (id, tenant_id, product_area_id, created_by, title, type, status, sections) VALUES ($1,$2,$3,$4,$5,'UserStory','draft',$6)`,
    [usId, tenantId, productAreaId, userId, usTitle, JSON.stringify({ content: usContent })]
  );

  // ── 5. Generate Acceptance Criteria ───────────────────────────────────────
  const acTitle = `Acceptance Criteria — ${themes.slice(0, 2).join(' & ')}`;
  progress('acceptance_criteria', `Generating Acceptance Criteria…`);
  const acContent = await generateDocumentText({
    type: 'AcceptanceCriteria', context: { title: acTitle, themes, feedbackSummary }, tenantId, productAreaId: productAreaId ?? undefined,
  });
  const acId = uuidv4();
  await query(
    `INSERT INTO documents (id, tenant_id, product_area_id, created_by, title, type, status, sections) VALUES ($1,$2,$3,$4,$5,'AcceptanceCriteria','draft',$6)`,
    [acId, tenantId, productAreaId, userId, acTitle, JSON.stringify({ content: acContent })]
  );

  // ── 6. Create Roadmap items (one per theme, linked to opportunity) ─────────
  progress('roadmap', `Creating ${themes.length} roadmap item(s)…`);
  const roadmapIds: string[] = [];
  for (let i = 0; i < themes.length; i++) {
    const id = uuidv4();
    await query(
      `INSERT INTO roadmap_items (id, tenant_id, product_area_id, opportunity_id, title, description, status, priority_score, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,'backlog',$7,$8)`,
      [id, tenantId, productAreaId, opportunityIds[i], `Address: ${themes[i]}`,
       `Roadmap item generated from customer feedback. Theme "${themes[i]}" appeared in ${themeCounts[i]} item(s).`,
       Math.max(1, 10 - i), userId]
    );
    roadmapIds.push(id);
  }

  // ── 7. Create Sprint (empty — PM promotes roadmap items to tickets via Roadmap board) ──
  progress('sprint', `Creating sprint…`);
  const today = new Date();
  const sprintEnd = new Date(today); sprintEnd.setDate(today.getDate() + 14);
  const sprintName = input.sprintName ?? `Sprint ${today.toISOString().slice(0, 10)} — Auto`;
  const sprintId = uuidv4();
  await query(
    'INSERT INTO sprints (id, tenant_id, product_area_id, name, goal, start_date, end_date) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [sprintId, tenantId, productAreaId, sprintName,
     `Resolve top customer-reported issues: ${themes.slice(0, 2).join(', ')}`,
     today.toISOString().slice(0, 10), sprintEnd.toISOString().slice(0, 10)]
  );
  // Tickets are NOT auto-created here — PM uses the Roadmap board "→ Sprint" button
  // to deliberately promote roadmap items into sprint tickets one by one.

  progress('done', `Pipeline complete — PRD, User Stories, AC, ${roadmapIds.length} roadmap items and sprint "${sprintName}" created.`);

  // ── 9. Sync created documents into Knowledge Base ──────────────────────────
  try {
    for (const [docId, docTitle, content] of [[prdId, prdTitle, prdContent], [usId, usTitle, usContent], [acId, acTitle, acContent]] as [string, string, string][]) {
      await query(
        `INSERT INTO knowledge_entries (id, tenant_id, product_area_id, title, content, entry_type, source_id, source_type, metadata)
         VALUES ($1,$2,$3,$4,$5,'document',$6,'documents',$7)`,
        [uuidv4(), tenantId, productAreaId, docTitle, content.slice(0, 8000), docId, JSON.stringify({ auto_indexed: true })]
      );
    }
  } catch { /* non-fatal */ }

  return { prdId, usId, acId, sprintId, opportunityIds, roadmapIds };
}
