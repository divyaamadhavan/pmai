/**
 * AI Orchestration Layer - mock implementation (no API key required).
 * Returns realistic responses. Swap with real Claude calls when an API key is available.
 */

export type ChunkCallback = (chunk: string) => void;

async function streamText(text: string, onChunk: ChunkCallback): Promise<void> {
  const words = text.split(' ');
  for (const word of words) {
    onChunk(word + ' ');
    await new Promise((r) => setTimeout(r, 15));
  }
}

export interface FeedbackAnalysisItem { id: string; body: string; }
export interface ThemeMatch { name: string; snippet: string; }

export interface FeedbackAnalysisResult {
  id: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  sentimentScore: number;
  themes: ThemeMatch[];
}

// Each theme maps to keywords that must actually appear in the feedback text.
// Keywords must be specific enough that they only match genuine mentions of that topic.
// Avoid short ambiguous words that appear in unrelated sentences.
const THEME_KEYWORDS: Record<string, string[]> = {
  'Onboarding friction':      ['onboard', 'onboarding', 'setup wizard', 'getting started', 'first time', 'new user', 'empty state', 'guided setup', 'initial setup', 'sign up'],
  'Reporting & exports':      ['export', 'exports', 'confluence', 'notion', 'download', 'pdf export', 'copy-paste', 'copy paste', 'formatting issues'],
  'Performance issues':       ['performance', 'lag', 'latency', 'timeout', 'crashes', 'freeze', 'unresponsive', 'too slow', 'runs slow', 'very slow'],
  'Integration requests':     ['integration', 'integrate', 'slack', 'jira', 'github', 'webhook', 'zapier', 'salesforce', 'api access'],
  'Mobile experience':        ['mobile', 'ios', 'android', 'phone', 'tablet', 'app store', 'mobile app'],
  'Dashboard UX':             ['dashboard', 'navigation menu', 'ui design', 'user interface', 'layout'],
  'Permissions & access':     ['permission', 'permissions', 'invite teammate', 'inviting teammate', 'access control', 'user role', 'admin role', 'workspace permissions'],
  'Sprint planning':          ['sprint planner', 'sprint brief', 'sprint planning', 'grooming', 'backlog', 'story points'],
  'Billing & pricing':        ['billing', 'pricing', 'upgrade to paid', 'paid plan', 'subscription cost'],
  'Notification settings':    ['notification', 'notifications', 'email digest', 'alert settings', 'reminder'],
};

function detectSentiment(text: string): { sentiment: 'positive' | 'neutral' | 'negative'; score: number } {
  const lower = text.toLowerCase();
  const pos = ['love', 'great', 'excellent', 'amazing', 'perfect', 'helpful', 'easy', 'fast', 'good', 'awesome', 'fantastic', 'win', 'saved'].filter((w) => lower.includes(w)).length;
  const neg = ['broken', 'slow', 'confusing', 'bug', 'error', 'fail', 'terrible', 'hate', 'issue', 'problem', 'crash', 'missing', 'cannot', 'frustrat', 'complicated', 'difficult'].filter((w) => lower.includes(w)).length;
  if (pos > neg) return { sentiment: 'positive', score: Math.min(0.95, 0.6 + pos * 0.08) };
  if (neg > pos) return { sentiment: 'negative', score: Math.min(0.95, 0.6 + neg * 0.08) };
  return { sentiment: 'neutral', score: 0.5 };
}

function extractSnippet(text: string, keyword: string): string {
  // Find the sentence containing the keyword and return it trimmed
  const sentences = text.split(/(?<=[.!?])\s+|[\n\r]+/);
  const lower = keyword.toLowerCase();
  const match = sentences.find((s) => s.toLowerCase().includes(lower));
  if (!match) return '';
  const trimmed = match.trim();
  return trimmed.length > 160 ? trimmed.slice(0, 157) + '…' : trimmed;
}

function pickThemes(text: string): ThemeMatch[] {
  const lower = text.toLowerCase();
  const matched: ThemeMatch[] = [];
  for (const [theme, keywords] of Object.entries(THEME_KEYWORDS)) {
    const hitKeyword = keywords.find((k) => lower.includes(k));
    if (hitKeyword) {
      matched.push({ name: theme, snippet: extractSnippet(text, hitKeyword) });
    }
    if (matched.length === 3) break;
  }
  return matched;
}

export async function analyseFeedback(
  items: FeedbackAnalysisItem[], _tenantId: string, _onChunk?: ChunkCallback
): Promise<FeedbackAnalysisResult[]> {
  return items.map((item) => {
    const { sentiment, score } = detectSentiment(item.body);
    return { id: item.id, sentiment, sentimentScore: score, themes: pickThemes(item.body) };
  });
}


// ─── Pipeline Preview ─────────────────────────────────────────────────────────

export interface PipelinePreview {
  themes: Array<{ name: string; count: number }>;
  proposedPRD: { title: string; overview: string };
  proposedUserStories: Array<{ title: string }>;
  proposedRoadmapItems: Array<{ title: string; description: string; priority: number }>;
  proposedSprintName: string;
  proposedTickets: Array<{ title: string; type: string; points: number }>;
}

export function buildPipelinePreview(
  themes: string[], themeCounts: number[], feedbackCount: number
): PipelinePreview {
  const today = new Date().toISOString().slice(0, 10);
  return {
    themes: themes.map((t, i) => ({ name: t, count: themeCounts[i] })),
    proposedPRD: {
      title: `Product Requirements — ${themes.slice(0, 2).join(' & ')}`,
      overview: `Based on ${feedbackCount} feedback item(s) across ${themes.length} theme(s): ${themes.join(', ')}.`,
    },
    proposedUserStories: themes.map((t) => ({ title: `User Stories — ${t}` })),
    proposedRoadmapItems: themes.map((t, i) => ({
      title: `Address: ${t}`,
      description: `Generated from ${themeCounts[i]} feedback item(s) about "${t}".`,
      priority: Math.max(1, 10 - i),
    })),
    proposedSprintName: `Sprint ${today} — ${themes.slice(0, 2).join(' & ')}`,
    proposedTickets: themes.slice(0, 5).map((t, i) => ({
      title: `[${(['STORY','STORY','TASK','SPIKE','BUG'])[i % 5]}] ${t}`,
      type: (['story','story','task','spike','bug'])[i % 5],
      points: [5, 8, 3, 5, 3][i % 5],
    })),
  };
}

// ─── Document Generation ──────────────────────────────────────────────────────

export interface DocumentGenInput {
  type: 'PRD' | 'UserStory' | 'AcceptanceCriteria';
  context: Record<string, unknown>;
  tenantId: string;
  productAreaId?: string;
}

const PRD_TEMPLATE = (title: string, themes: string[], feedbackSummary: string) =>
`# PRD — ${title}

## Problem Statement
Customer feedback analysis identified ${feedbackSummary}. The following themes emerged from direct customer communication:
${themes.map((t, i) => `${i + 1}. **${t}**`).join('\n')}

These issues are causing customer churn, blocking enterprise deals, and reducing adoption among new users.

## Goals and Success Metrics
- Resolve top ${Math.min(themes.length, 3)} pain points within one quarter
- Reduce customer-reported friction in onboarding by 50%
- Unblock enterprise deals requiring security and compliance features
- Achieve NPS improvement of +10 points within 6 months

## Target Users
**Primary:** Product Managers and team leads at mid-market SaaS companies evaluating or actively using this platform.
**Secondary:** Engineering leads and VPs who consume reports and approve spend.
**Tertiary:** End users (individual contributors) who interact with the product daily.

## User Stories
${themes.map((t, i) => `${i + 1}. As a user affected by **${t}**, I want a reliable solution so that my workflow is unblocked and I can achieve my goals efficiently.`).join('\n')}

## Functional Requirements
${themes.map((t, i) => `FR-${String(i + 1).padStart(2, '0')}: Address **${t}** — implement changes verified against customer feedback evidence`).join('\n')}

## Non-Functional Requirements
- Changes must maintain existing performance SLAs (p95 < 200ms)
- All new features must be accessible (WCAG 2.1 AA)
- Enterprise features require SOC 2 Type II compliance alignment

## Out of Scope (Phase 1)
- Features not supported by collected customer feedback evidence
- Real-time collaboration / multiplayer editing
- Native mobile application

## Open Questions
1. Which theme has the highest revenue impact — prioritize accordingly?
2. Are there customer segments disproportionately affected by specific themes?
3. What is the engineering effort estimate for each functional requirement?

## Success Criteria
- All functional requirements shipped and verified in production
- Customer feedback volume for identified themes drops by ≥ 30% in next cycle
- Zero critical (P0/P1) bugs at launch

---
*Generated by PMAI from customer feedback. Accountable author: PM. Review before sharing.*`;

const US_TEMPLATE = (title: string, themes: string[]) =>
`# User Stories — ${title}

${themes.map((theme, i) => {
  const num = String(i + 1).padStart(2, '0');
  return `## Story ${num}: ${theme}

**As a** product user impacted by ${theme},
**I want** a clear, working solution to this problem,
**So that** I can complete my work without workarounds or frustration.

### Acceptance Criteria
- **Given** I am authenticated and on the relevant page,
  **When** I attempt the action related to ${theme},
  **Then** it works correctly within 3 seconds without errors.
- **Given** the feature is implemented,
  **When** I complete my task,
  **Then** I receive clear confirmation and can continue my workflow.
- **Given** an error occurs,
  **When** the system fails,
  **Then** I see a helpful error message with next steps.

### Story Points: 5
### Priority: High
### Labels: customer-feedback, ${theme.toLowerCase().replace(/\s+/g, '-')}`;
}).join('\n\n')}

---
*Generated by PMAI from customer feedback. Review and refine before sprint planning.*`;

const AC_TEMPLATE = (title: string, themes: string[]) =>
`# Acceptance Criteria — ${title}

${themes.map((theme, i) => `## Theme ${i + 1}: ${theme}

### Scenario A: Happy Path
- **Given** I am authenticated with the appropriate role
- **And** the feature for "${theme}" is available
- **When** I perform the primary action
- **Then** the result is correct and displayed within 3 seconds
- **And** the action is recorded in the audit log

### Scenario B: Error Handling
- **Given** an invalid input or system error occurs
- **When** the action fails
- **Then** I see an actionable error message
- **And** no data is corrupted or lost

### Scenario C: Edge Cases
- **Given** I am using the feature at scale or in an unexpected sequence
- **When** I complete the action
- **Then** the system handles it gracefully without crashing`).join('\n\n')}

---
*Generated by PMAI. All scenarios must pass QA sign-off before release.*`;

export async function generateDocument(input: DocumentGenInput, onChunk: ChunkCallback): Promise<void> {
  const title = (input.context['title'] as string) ?? 'Untitled';
  const themes = (input.context['themes'] as string[]) ?? [];
  const feedbackSummary = (input.context['feedbackSummary'] as string) ?? 'multiple customer pain points';
  let content: string;
  if (input.type === 'PRD') content = PRD_TEMPLATE(title, themes, feedbackSummary);
  else if (input.type === 'UserStory') content = US_TEMPLATE(title, themes);
  else content = AC_TEMPLATE(title, themes);
  await streamText(content, onChunk);
}

export async function generateDocumentText(input: DocumentGenInput): Promise<string> {
  const chunks: string[] = [];
  await generateDocument(input, (chunk) => chunks.push(chunk));
  return chunks.join('');
}

export async function regenerateSection(
  _documentId: string, sectionKey: string, _context: Record<string, unknown>, onChunk: ChunkCallback
): Promise<void> {
  await streamText(
    `## ${sectionKey} (Regenerated)\n\nRegenerated based on latest customer feedback data. Analysis incorporates 312 feedback items across 5 channels, with sentiment skewing 65% negative.\n\nKey sub-themes: slow load time (148 mentions), missing export option (97 mentions), confusing navigation (67 mentions).\n\nRecommendation: prioritize the export feature - highest severity-to-effort ratio.`,
    onChunk
  );
}

interface PipelineData {
  themes: Array<{ name: string; item_count: number }>;
  totalFeedback: number;
  bookOfWork: Array<{ theme_name: string; category: string; priority: string; feedback_count: number }>;
  backlog: Array<{ theme_name: string; category: string; priority: string; feedback_count: number }>;
  dismissed: Array<{ theme_name: string; feedback_count: number }>;
  pending: Array<{ theme_name: string; feedback_count: number }>;
  roadmapItems: Array<{ title: string; status: string; description: string }>;
  sprint: Record<string, string> | null;
  tickets: Array<{ title: string; status: string; story_points: number; type: string }>;
  totalPoints: number;
  doneTickets: Array<{ title: string }>;
  inProgress: Array<{ title: string }>;
}

export async function generateInsightSummary(
  audience: string, _tenantId: string, _productAreaId: string | undefined, onChunk: ChunkCallback,
  data?: PipelineData
): Promise<void> {
  if (!data || data.themes.length === 0) {
    await streamText(
      `## No pipeline data yet\n\nComplete the pipeline first:\n1. Upload and process feedback in Feedback Hub\n2. Make PM decisions on classified themes\n3. Build your roadmap and sprint\n\nThen return here to generate a stakeholder report grounded in your actual decisions.`,
      onChunk
    );
    return;
  }

  const { themes, totalFeedback, bookOfWork, backlog, dismissed, pending, roadmapItems, sprint, tickets, totalPoints, doneTickets, inProgress } = data;
  const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  const topThemes = themes.slice(0, 5).map((t, i) => `${i + 1}. **${t.name}** — ${t.item_count} feedback item${t.item_count !== 1 ? 's' : ''}`).join('\n');

  const committedList = bookOfWork.length > 0
    ? bookOfWork.map(c => `- **${c.theme_name}** (${c.priority} priority, ${c.feedback_count} feedback items)`).join('\n')
    : '- No items in backlog yet';

  const backlogList = committedList;

  const roadmapList = roadmapItems.length > 0
    ? roadmapItems.slice(0, 6).map(r => `- **${r.title}** — ${r.status}`).join('\n')
    : '- No roadmap items yet';

  const sprintSection = sprint
    ? `**Sprint:** ${sprint.name ?? 'Active Sprint'} | Goal: ${sprint.goal ?? 'Not set'}\n**Tickets:** ${tickets.length} total · ${totalPoints} points · ${doneTickets.length} done · ${inProgress.length} in progress`
    : '- No active sprint yet';

  let report = '';

  if (audience === 'CPO') {
    report = `# Product Report — CPO Briefing
*${date}*

## Executive Summary

${totalFeedback} customer feedback items processed across ${themes.length} theme${themes.length !== 1 ? 's' : ''}. PM has made decisions on ${bookOfWork.length + backlog.length + dismissed.length} of ${bookOfWork.length + backlog.length + dismissed.length + pending.length} classified items.

## Top Customer Themes

${topThemes}

## PM Decisions Made

### Added to Backlog (${bookOfWork.length})
${committedList}

${dismissed.length > 0 ? `### Dismissed (${dismissed.length})\n${dismissed.map(d => `- ${d.theme_name}`).join('\n')}` : ''}

## Roadmap Status

${roadmapList}

## Current Sprint

${sprintSection}

## Strategic Recommendation

${bookOfWork.length === 0
  ? 'No items in backlog yet. Review the classified themes in Feedback Hub and make PM decisions to move this forward.'
  : `Focus is correctly placed on ${bookOfWork[0]?.theme_name ?? 'the top priority theme'}. ${pending.length > 0 ? `${pending.length} theme(s) still awaiting PM decision.` : 'All themes have been decided.'}`}

---
*Generated by PMAI · ${date}*`;

  } else if (audience === 'Engineering') {
    report = `# Product Report — Engineering Handoff
*${date}*

## What We're Building and Why

Based on ${totalFeedback} customer feedback items, the following has been committed:

### Backlog (Committed Work)
${committedList}

### Roadmap Items

${roadmapList}

## Current Sprint

${sprintSection}

${tickets.length > 0 ? `### Sprint Tickets\n${tickets.slice(0, 10).map(t => `- [${t.type?.toUpperCase() ?? 'TASK'}] ${t.title} — ${t.story_points ?? '?'} pts (${t.status})`).join('\n')}` : ''}

## What's Parked (Backlog — not this cycle)

${backlogList}

## Customer Context

Top themes driving this work:
${topThemes}

These come from real customer feedback. Engineering questions about scope or priority should be raised against these themes.

---
*Generated by PMAI · ${date}*`;

  } else {
    // Sales
    report = `# Product Report — Sales Briefing
*${date}*

## What's Coming for Customers
*${date}*

We have processed ${totalFeedback} customer feedback items. Here's what's being built and when.

## Committed Improvements (Backlog)

${committedList}

## Top Customer Pain Points Being Addressed

${topThemes}

## Roadmap — What to Tell Customers

${roadmapList}

## Current Sprint — In Active Development

${sprintSection}

## Talking Points

${bookOfWork.length > 0
  ? bookOfWork.slice(0, 3).map((c: { theme_name: string; feedback_count: number; priority: string }) => `- **${c.theme_name}**: In our roadmap, driven by ${c.feedback_count} customer requests. Priority: ${c.priority}.`).join('\n')
  : '- Work is being scoped based on customer feedback. Check back once PM decisions are made.'}

## What's NOT in Scope This Cycle

${backlog.length > 0
  ? `The following are parked for future planning: ${backlog.map(b => b.theme_name).join(', ')}. Set expectations with customers accordingly.`
  : 'All identified themes have been addressed or committed.'}

---
*Generated by PMAI · ${date}*`;
  }

  await streamText(report, onChunk);
}

export async function generateRoadmapJustification(
  roadmapItemId: string, _tenantId: string, onChunk: ChunkCallback
): Promise<void> {
  await streamText(
    `## Roadmap Justification\n\nThis item is supported by 198 customer feedback entries over the past 90 days. Sentiment is 71% negative.\n\nCustomer Impact: Enterprise and mid-market segments are disproportionately affected. Three active sales opportunities (combined ARR: $420K) are blocked.\n\nStrategic Fit: Aligns with Q3 objective Reduce Friction to Value. 4 of 5 direct competitors offer this natively.\n\nEffort vs Evidence: 8 story points. Evidence score ranks this number 2 of 12 backlog items.\n\nItem ID: ${roadmapItemId}`,
    onChunk
  );
}

export async function analyseTradeoffs(
  roadmapItemIds: string[], _tenantId: string, onChunk: ChunkCallback
): Promise<void> {
  await streamText(
    `## Roadmap Tradeoff Analysis\n\nComparing ${roadmapItemIds.length} items:\n\nOption A: Customer Evidence 198 items (high), Severity 71% negative, Effort 8 points, Revenue at risk $420K ARR\nOption B: Customer Evidence 89 items (medium), Severity 54% negative, Effort 13 points, Revenue at risk $180K ARR\n\nRecommendation: Prioritize Option A. Higher evidence, lower effort, larger revenue impact. Option B enters next planning cycle after Option A ships.`,
    onChunk
  );
}

export async function generateSprintTickets(
  roadmapItemId: string, _tenantId: string, onChunk: ChunkCallback
): Promise<void> {
  await streamText(
    `## Generated Sprint Tickets - ${roadmapItemId}\n\nTICKET-001: Backend export endpoint | Story | 3 points\nCreate GET /api/export/feedback that streams a CSV of all feedback items. Returns CSV with id, body, sentiment, channel, received_at. Downloads in under 5 seconds for 10,000 rows.\n\nTICKET-002: Frontend export button | Story | 2 points\nAdd Export CSV button to Feedback Hub toolbar. Visible to PM and Product Leader roles. Download begins within 2 seconds.\n\nTICKET-003: PDF export renderer | Story | 5 points\nServer-side PDF generation from insight reports. Includes logo, title, date, all sections. File under 2 MB. Depends on TICKET-001.\n\nTICKET-004: Export rate limiting | Task | 1 point\nAdd per-tenant rate limit of 10 exports per hour. Depends on TICKET-001.`,
    onChunk
  );
}

export async function generateSprintBrief(
  sprint: Record<string, string | null>,
  tickets: Record<string, unknown>[],
  onChunk: ChunkCallback
): Promise<void> {
  const totalPoints = tickets.reduce((s, t) => s + ((t.story_points as number) ?? 0), 0);
  const doneCount = tickets.filter(t => t.status === 'done').length;
  const inProgressCount = tickets.filter(t => t.status === 'in_progress').length;
  const todoCount = tickets.filter(t => t.status === 'todo').length;
  const needsGrooming = tickets.filter(t => t.needs_grooming).length;
  const missingAC = tickets.filter(t => !t.acceptance_criteria).length;

  const ticketLines = tickets.map((t, i) => {
    const ac = (() => { try { const p = JSON.parse(t.acceptance_criteria as string ?? '[]'); return Array.isArray(p) ? p : []; } catch { return []; } })();
    return `${i + 1}. **${t.title}** [${t.status ?? 'todo'}, ${t.story_points ?? '?'} pts]\n   ${t.description ? (t.description as string).slice(0, 120) : 'No description'}${ac.length ? `\n   AC: ${ac.slice(0, 2).join(' | ')}` : ''}`;
  }).join('\n\n');

  const risks: string[] = [];
  if (needsGrooming > 0) risks.push(`${needsGrooming} ticket(s) flagged for grooming — clarify before dev picks up`);
  if (missingAC > 0) risks.push(`${missingAC} ticket(s) missing acceptance criteria — definition of done unclear`);
  if (totalPoints > 40) risks.push(`High point load (${totalPoints} pts) — consider descoping lower-priority items`);
  if (tickets.length === 0) risks.push('No tickets in sprint — add stories from the Roadmap board');

  const brief = [
    `## Sprint Brief — ${sprint.name ?? 'Current Sprint'}`,
    `**Period:** ${sprint.start_date ?? '?'} → ${sprint.end_date ?? '?'}`,
    sprint.goal ? `**Goal:** ${sprint.goal}` : '',
    '',
    `### Scope`,
    `${tickets.length} user ${tickets.length === 1 ? 'story' : 'stories'} · ${totalPoints} story points committed`,
    `Status: ${doneCount} done · ${inProgressCount} in progress · ${todoCount} to do`,
    '',
    tickets.length > 0 ? `### User Stories\n\n${ticketLines}` : '### User Stories\n\nNo tickets added yet. Go to the Roadmap board and click "→ Sprint" to add stories.',
    '',
    `### Readiness Check`,
    risks.length > 0
      ? risks.map(r => `⚠ ${r}`).join('\n')
      : '✓ All tickets have acceptance criteria and are ready for development.',
    '',
    `### Success Criteria`,
    tickets.length > 0
      ? tickets.map(t => `- ${t.title} is delivered and verified by PM`).join('\n')
      : '- Define tickets first',
    '',
    `*Generated by PMAI · ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}*`,
  ].filter(Boolean).join('\n');

  await streamText(brief, onChunk);
}

export async function groomBacklog(
  _tenantId: string, _sprintId?: string
): Promise<Array<{ ticketId: string; notes: string }>> {
  return [
    { ticketId: 'sample-1', notes: 'Missing acceptance criteria - define Given/When/Then before sprint planning.' },
    { ticketId: 'sample-2', notes: 'Story estimate of 13 points exceeds threshold of 8. Consider splitting into two tickets.' },
    { ticketId: 'sample-3', notes: 'Improve performance is ambiguous - add a specific metric target such as p95 latency under 200ms.' },
  ];
}

// ─── Feedback Classification ──────────────────────────────────────────────────

export type FeedbackCategory =
  | 'Bug Fix / Reliability'
  | 'Feature Request'
  | 'UX / Usability'
  | 'Performance'
  | 'Integration / API'
  | 'Security / Compliance'
  | 'Onboarding / Documentation'
  | 'Billing / Pricing';

export type PriorityLevel = 'critical' | 'high' | 'medium' | 'low';

export type FeedbackType = 'Fix' | 'Enhancement';

// Categories that are defect/reliability fixes; everything else is an enhancement
const FIX_CATEGORIES = new Set<FeedbackCategory>(['Bug Fix / Reliability', 'Performance', 'Security / Compliance']);

export interface FeedbackClassification {
  themeName: string;
  category: FeedbackCategory;
  type: FeedbackType;
  customerAspect: string;
  priority: PriorityLevel;
  priorityRationale: string;
  criticalRecommendation: boolean;
  criticalReason: string;
  financialBenefits: string[];
  qualitativeBenefits: string[];
  tradeoffs: string[];
  affectedUsers: string;
  revenueImpact: string;
  feedbackCount: number;
}

const CATEGORY_RULES: Array<{ category: FeedbackCategory; keywords: string[] }> = [
  { category: 'Bug Fix / Reliability',        keywords: ['bug', 'broken', 'crash', 'error', 'fail', 'fix', 'reliability'] },
  { category: 'Performance',                  keywords: ['performance', 'slow', 'lag', 'latency', 'timeout', 'speed', 'freeze'] },
  { category: 'Integration / API',            keywords: ['integration', 'api', 'slack', 'jira', 'github', 'webhook', 'zapier', 'connector'] },
  { category: 'Security / Compliance',        keywords: ['security', 'compliance', 'sso', 'permission', 'access', 'audit', 'gdpr', 'soc2'] },
  { category: 'Onboarding / Documentation',   keywords: ['onboard', 'setup', 'guide', 'documentation', 'getting started', 'tutorial', 'empty state'] },
  { category: 'UX / Usability',               keywords: ['dashboard', 'navigation', 'ui', 'ux', 'layout', 'design', 'mobile', 'usability', 'confusing', 'friction'] },
  { category: 'Billing / Pricing',            keywords: ['billing', 'pricing', 'subscription', 'plan', 'cost', 'upgrade'] },
  { category: 'Feature Request',              keywords: ['feature', 'request', 'want', 'need', 'export', 'notification', 'sprint', 'report'] },
];

function classifyTheme(themeName: string, feedbackCount: number, negativeRatio: number, priority: PriorityLevel): FeedbackClassification {
  const lower = themeName.toLowerCase();

  let category: FeedbackCategory = 'Feature Request';
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some((k) => lower.includes(k))) {
      category = rule.category;
      break;
    }
  }

  const type: FeedbackType = FIX_CATEGORIES.has(category) ? 'Fix' : 'Enhancement';

  const criticalRecommendation = priority === 'critical' || priority === 'high' ||
    category === 'Bug Fix / Reliability' || category === 'Security / Compliance';

  const urgencyNote = (priority === 'critical' || priority === 'high')
    ? 'Ranked high priority relative to other feedback — immediate PM attention required.'
    : priority === 'medium'
      ? 'Moderate urgency — schedule within current or next planning cycle.'
      : 'Lower urgency relative to other feedback — monitor and re-evaluate.';
  const priorityRationale = `${feedbackCount} feedback item(s) with ${Math.round(negativeRatio * 100)}% negative sentiment. Category "${category}" — ${type === 'Fix' ? 'reliability issue that blocks users' : 'enhancement that improves product value'}. ${urgencyNote}`;

  const criticalReasonMap: Record<FeedbackCategory, string> = {
    'Bug Fix / Reliability': `Reliability failures block users from completing core workflows. With ${feedbackCount} reports, this is causing active churn and trust erosion. Fix immediately to protect retention.`,
    'Feature Request': `${feedbackCount} customers explicitly requested this capability. Ignoring stated needs signals poor product-market fit responsiveness and risks churn to competitors who deliver it.`,
    'UX / Usability': `Usability friction directly suppresses activation and retention rates. ${feedbackCount} signals indicate this is a systemic barrier, not edge-case noise. Every sprint delayed is compounding drop-off.`,
    'Performance': `Performance degradation is the top reason users abandon SaaS tools silently. ${feedbackCount} complaints represent a fraction of affected users — most churn without reporting.`,
    'Integration / API': `Integration gaps force manual workarounds that waste hours weekly. ${feedbackCount} requests indicate teams are ready to adopt but blocked. Competitors win deals on integration breadth.`,
    'Security / Compliance': `Security and compliance gaps block enterprise sales outright. ${feedbackCount} mentions signal active deal blockers. Every sprint delayed costs potential enterprise ARR.`,
    'Onboarding / Documentation': `Poor onboarding kills activation. ${feedbackCount} reports mean new users are failing before experiencing product value — directly suppressing trial-to-paid conversion rates.`,
    'Billing / Pricing': `Billing friction causes involuntary churn and abandoned upgrades. ${feedbackCount} signals indicate revenue is leaking through a preventable experience gap.`,
  };

  // Financial benefits (quantified where estimable)
  const financialBenefitsMap: Record<FeedbackCategory, string[]> = {
    'Bug Fix / Reliability': [
      `Estimated 5–15% churn reduction among affected users — at avg ACV, each retained customer = direct ARR saved`,
      'Reduced support ticket volume lowers CS cost per customer by an estimated 10–20%',
      'Elimination of SLA breach risk protects enterprise contract renewals',
      'Faster resolution cycle reduces engineering interrupt cost (avg $500–2000/ticket escalation avoided)',
    ],
    'Feature Request': [
      'Unlocks upgrade conversion for customers blocked on this feature — potential 8–12% MRR uplift in affected cohort',
      'Reduces churn-to-competitor rate, protecting LTV of existing accounts',
      'Opens upsell conversations with power users who requested this capability',
      'Reduces CAC by improving organic referral from satisfied customers',
    ],
    'UX / Usability': [
      'Trial-to-paid conversion improvement: even +2% activation lift = significant ARR at scale',
      'Reduced support volume from confused users — estimated 15–25% fewer onboarding tickets',
      'Higher DAU/MAU ratio increases product stickiness, improving retention-driven LTV',
      'Lower CS spend per new customer as self-serve success rates improve',
    ],
    'Performance': [
      'Enterprise SLA penalties avoided — typically 10–20% of contract value at risk per breach',
      'Reduced abandonment in critical flows preserves transaction and engagement revenue',
      'Faster product enables higher usage volume, improving usage-based billing outcomes',
      'Competitive differentiation unlocks deals where performance benchmarking is required',
    ],
    'Integration / API': [
      'Immediate upgrade conversion from teams who named this as their blocker',
      'Partner ecosystem referrals (Slack App Directory, Jira Marketplace) reduce paid CAC',
      'Workflow lock-in through integrations extends average contract length and LTV',
      'Enterprise procurement favours tools that fit existing stack — integration breadth wins RFPs',
    ],
    'Security / Compliance': [
      'Unblocks enterprise deals currently stalled on security review — direct pipeline impact',
      'SOC 2 / ISO 27001 certification opens regulated markets (healthcare, finance, government)',
      'Reduces cyber liability insurance premiums as security posture improves',
      'Prevents cost of breach — average SMB breach cost $120K–$1.2M+ (IBM 2024)',
    ],
    'Onboarding / Documentation': [
      'Trial-to-paid conversion uplift: +5% activation = material ARR gain at scale',
      'CS cost reduction: self-serve success means fewer onboarding calls (avg $200–500/call saved)',
      'Time-to-value reduction improves NPS within first 30 days — correlated with renewal rate',
      'Lower support burden in first 90 days reduces churn before customers reach habit formation',
    ],
    'Billing / Pricing': [
      'Direct uplift in upgrade conversion rate — billing clarity removes a primary objection',
      'Involuntary churn recovery: fixing payment failure flows typically recovers 1–3% MRR',
      'Improved pricing transparency reduces sales cycle length and negotiation friction',
      'Accurate billing builds trust that drives expansion revenue from existing customers',
    ],
  };

  // Qualitative benefits
  const qualitativeBenefitsMap: Record<FeedbackCategory, string[]> = {
    'Bug Fix / Reliability': [
      'Restores customer trust and confidence in the platform',
      'Improves NPS and public review scores on G2/Capterra',
      'Reduces negative word-of-mouth from frustrated users',
      'Frees engineering focus from reactive firefighting to proactive development',
    ],
    'Feature Request': [
      'Demonstrates the team listens to customers — strengthens brand loyalty',
      'Creates case studies and testimonials from customers who requested this',
      'Builds competitive moat as product better fits customer mental models',
      'Improves relationship with vocal customer advocates',
    ],
    'UX / Usability': [
      'New users feel confident and capable from day one',
      'Reduces anxiety and confusion that causes silent churn',
      'Builds a reputation for intuitive, well-designed product',
      'Improves accessibility and inclusivity for a broader user base',
    ],
    'Performance': [
      'Users trust the product for high-stakes, time-sensitive work',
      'Positive performance experience drives organic recommendations',
      'Engineering team morale improves when not managing performance complaints',
      'Creates foundation for future scale without experience degradation',
    ],
    'Integration / API': [
      'Product becomes central to customers\' daily workflow — not a peripheral tool',
      'Developer community engagement around API expands brand reach',
      'Ecosystem positioning as a "plays well with others" platform',
      'Customer teams reduce context-switching, improving their productivity and satisfaction',
    ],
    'Security / Compliance': [
      'Brand reputation as a trustworthy, enterprise-grade platform',
      'Peace of mind for IT administrators and security teams',
      'Competitive differentiation in procurement processes requiring vendor security assessments',
      'Alignment with customer values around data privacy and responsible handling',
    ],
    'Onboarding / Documentation': [
      'First impressions define long-term relationships — a smooth start builds loyalty',
      'Self-sufficient users become internal champions within their organisations',
      'Reduces onboarding anxiety that leads to premature evaluation of alternatives',
      'Reflects product quality and team craftsmanship to new users',
    ],
    'Billing / Pricing': [
      'Transparency in pricing builds ethical brand image',
      'Removes a major source of customer distrust and frustration',
      'Finance stakeholders become advocates when billing is clear and predictable',
      'Reduces awkward customer service conversations about unexpected charges',
    ],
  };

  // Tradeoffs of NOT implementing
  const tradeoffsMap: Record<FeedbackCategory, string[]> = {
    'Bug Fix / Reliability': [
      'Continued customer churn — affected users leave silently without reporting',
      'Accumulating negative public reviews on G2, Capterra, and social media',
      'Engineering team distracted by escalating support tickets instead of building',
      'Enterprise customers may invoke SLA clauses or withhold renewals',
    ],
    'Feature Request': [
      'Customers adopt competitors who ship this capability faster',
      'Lost expansion revenue from accounts that need this to grow usage',
      'Support and PM teams repeatedly fielding the same request — wasted capacity',
      'Vocal customers who feel unheard become public detractors',
    ],
    'UX / Usability': [
      'High churn in first 30 days as users fail to reach value',
      'Support costs scale with confused users who can\'t self-serve',
      'Trial-to-paid conversion remains suppressed — paid marketing spend is wasted',
      'Negative first impressions persist in reviews that influence buyer decisions',
    ],
    'Performance': [
      'Users abandon slow flows, permanently reducing engagement and habit formation',
      'Enterprise accounts raise SLA breach concerns in QBRs',
      'Slow product sentiment compounds in public reviews over time',
      'Technical debt grows as performance issues attract workarounds that add complexity',
    ],
    'Integration / API': [
      'Customers spend hours manually transferring data between tools — visible pain point',
      'Competitors with integrations consistently win deals during evaluation stages',
      'Product perceived as siloed — not part of the customer\'s "stack"',
      'Teams revert to spreadsheets and email as workarounds — reducing usage metrics',
    ],
    'Security / Compliance': [
      'Active enterprise deals remain blocked in security review indefinitely',
      'Liability exposure if known security expectations remain unmet at time of incident',
      'Regulated-industry segments (healthcare, finance, government) remain inaccessible',
      'Risk of actual breach if known gaps are deprioritised',
    ],
    'Onboarding / Documentation': [
      'New user cohorts fail to activate — paid acquisition spend is wasted',
      'Customer Success spends disproportionate budget hand-holding basic setup',
      'Poor word-of-mouth in early user community suppresses organic growth',
      'Users churn before forming product habits — defeating retention strategy',
    ],
    'Billing / Pricing': [
      'Revenue leakage from abandoned upgrade flows and failed payment retries',
      'Involuntary churn from billing confusion erodes MRR silently',
      'Customers dispute charges, increasing CS burden and reputational risk',
      'Finance-led buying committees reject vendors with opaque pricing',
    ],
  };

  const customerAspectMap: Record<FeedbackCategory, string> = {
    'Bug Fix / Reliability': 'Product reliability & trust — customers cannot depend on core workflows',
    'Feature Request': 'Feature completeness — customers\' jobs-to-be-done are partially unmet',
    'UX / Usability': 'Ease of use — customers struggle to navigate and complete tasks confidently',
    'Performance': 'Speed & responsiveness — customers are blocked by slow or unresponsive product',
    'Integration / API': 'Workflow continuity — customers are forced into manual handoffs between tools',
    'Security / Compliance': 'Data trust & governance — customers cannot satisfy internal security requirements',
    'Onboarding / Documentation': 'Time-to-value — new customers fail to reach the "aha moment" independently',
    'Billing / Pricing': 'Financial clarity — customers are confused or frustrated by pricing and payment experience',
  };

  const affectedUsersMap: Record<FeedbackCategory, string> = {
    'Bug Fix / Reliability': 'All active users encountering the affected workflow',
    'Feature Request': 'Power users and teams requesting capability expansion',
    'UX / Usability': 'New users and users with low product familiarity',
    'Performance': 'High-frequency users and enterprise customers with SLA needs',
    'Integration / API': 'Users embedded in multi-tool workflows (Slack, Jira, etc.)',
    'Security / Compliance': 'Enterprise buyers, IT admins, and regulated-industry customers',
    'Onboarding / Documentation': 'New users in their first 30 days and trial accounts',
    'Billing / Pricing': 'Customers on free tiers considering upgrade, and finance stakeholders',
  };

  const revenueImpactMap: Record<FeedbackCategory, string> = {
    'Bug Fix / Reliability': 'Churn risk from affected customers; potential SLA penalty exposure',
    'Feature Request': 'Expansion revenue from customers who need this to scale; competitive loss risk',
    'UX / Usability': 'Trial conversion uplift; reduced CAC through better activation',
    'Performance': 'Enterprise deal blockers; at-risk ARR from SLA-sensitive accounts',
    'Integration / API': 'Partner-driven acquisition potential; stickiness through workflow lock-in',
    'Security / Compliance': 'Enterprise ARR currently blocked by security requirements',
    'Onboarding / Documentation': 'Activation rate improvement; reduced CS cost per new customer',
    'Billing / Pricing': 'Direct revenue impact from improved upgrade conversion',
  };

  return {
    themeName,
    category,
    type,
    customerAspect: customerAspectMap[category],
    priority,
    priorityRationale,
    criticalRecommendation,
    criticalReason: criticalReasonMap[category],
    financialBenefits: financialBenefitsMap[category],
    qualitativeBenefits: qualitativeBenefitsMap[category],
    tradeoffs: tradeoffsMap[category],
    affectedUsers: affectedUsersMap[category],
    revenueImpact: revenueImpactMap[category],
    feedbackCount,
  };
}

export function classifyThemes(
  themes: string[],
  themeCounts: number[],
  sentimentBreakdowns?: Array<{ negative: number; total: number }>
): FeedbackClassification[] {
  // Compute a raw score per theme
  const scores = themes.map((_, i) => {
    const count = themeCounts[i] ?? 1;
    const negRatio = sentimentBreakdowns?.[i]
      ? sentimentBreakdowns[i].negative / Math.max(1, sentimentBreakdowns[i].total)
      : 0.5;
    // Base score: volume × sentiment weight
    const lower = themes[i].toLowerCase();
    const isBugOrPerf = ['bug', 'broken', 'crash', 'error', 'fail', 'performance', 'slow', 'lag', 'security', 'permission', 'access'].some(k => lower.includes(k));
    return count * (0.5 + negRatio * 0.5) * (isBugOrPerf ? 1.5 : 1.0);
  });

  const maxScore = Math.max(...scores, 1);
  const n = themes.length;

  // Assign priorities relative to the batch so we always get a spread
  const priorities: PriorityLevel[] = scores.map((score) => {
    const pct = score / maxScore;
    // Top 15% → critical, next 25% → high, next 35% → medium, rest → low
    if (pct >= 0.85) return 'critical';
    if (pct >= 0.60) return 'high';
    if (pct >= 0.30) return 'medium';
    return 'low';
  });

  // Guarantee at least one critical when there are bugs/security themes
  const hasBugTheme = themes.some(t => ['bug', 'broken', 'crash', 'error', 'security', 'permission'].some(k => t.toLowerCase().includes(k)));
  if (hasBugTheme && !priorities.includes('critical') && n >= 1) {
    const topIdx = scores.indexOf(Math.max(...scores));
    priorities[topIdx] = 'critical';
  }

  return themes.map((name, i) => {
    const count = themeCounts[i] ?? 1;
    const negRatio = sentimentBreakdowns?.[i]
      ? sentimentBreakdowns[i].negative / Math.max(1, sentimentBreakdowns[i].total)
      : 0.5;
    return classifyTheme(name, count, negRatio, priorities[i]);
  });
}

export async function embedText(text: string): Promise<number[]> {
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (text.charCodeAt(i) + ((hash << 5) - hash)) & 0xffffffff;
  const vec: number[] = [];
  for (let i = 0; i < 384; i++) {
    const x = Math.sin(hash + i * 127.1) * 43758.5453;
    vec.push(x - Math.floor(x));
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  return vec.map((v) => v / norm);
}

export async function answerQuestion(
  question: string, _tenantId: string, onChunk: ChunkCallback
): Promise<void> {
  await streamText(
    `Question: ${question}\n\nAnswer from your knowledge base:\n\nBased on historical product decisions in your workspace, the most relevant context comes from Q2 planning and the Onboarding Revamp PRD. The team previously deferred SSO integration to Q3 due to engineering capacity constraints. The feedback cluster Onboarding friction (312 items) was the primary driver for prioritizing the guided setup flow in Sprint 22.\n\nKey product principles in your knowledge base:\n1. Evidence-first prioritization - no roadmap item without customer data\n2. PM as author - all AI-generated docs require PM review before sharing\n3. Cross-functional visibility - sprint briefs shared with engineering leads before planning\n\nAnswer generated by PMAI Knowledge Base. Verify against source documents before acting.`,
    onChunk
  );
}

// ─── Document Assistant ───────────────────────────────────────────────────────

export interface DocumentAssistantInput {
  command: string;
  documentTitle?: string;
  documentContent?: string;
  uploadedFiles?: Array<{ name: string; content: string }>;
}

export interface DocumentAssistantResult {
  action?: string;
  updatedContent?: string;
  ticketData?: { title: string; description: string; type: string; points: number };
}

export async function documentAssistant(
  input: DocumentAssistantInput, onChunk: ChunkCallback
): Promise<DocumentAssistantResult> {
  const { command, documentTitle, documentContent, uploadedFiles = [] } = input;
  const cmdLower = command.toLowerCase();
  const fileContext = uploadedFiles.length > 0
    ? `\n\nReferenced uploaded files:\n${uploadedFiles.map((f) => `• ${f.name}: ${f.content.slice(0, 400)}...`).join('\n')}`
    : '';

  let response: string;
  let action: string | undefined;
  let updatedContent: string | undefined;
  let ticketData: DocumentAssistantResult['ticketData'] | undefined;

  if (cmdLower.includes('create ticket') || cmdLower.includes('create sprint ticket') || cmdLower.includes('add ticket') || (cmdLower.includes('ticket') && (cmdLower.includes('create') || cmdLower.includes('generate') || cmdLower.includes('make')))) {
    action = 'create_ticket';
    const ticketTitle = documentTitle ? `[STORY] Implement: ${documentTitle}` : '[STORY] New ticket from document';
    ticketData = {
      title: ticketTitle,
      description: documentContent
        ? `Derived from document "${documentTitle}".\n\n${documentContent.slice(0, 500)}`
        : `Ticket generated from document assistant command: "${command}".`,
      type: 'story',
      points: 5,
    };
    response = `✅ Sprint ticket created!\n\n**Title:** ${ticketTitle}\n**Type:** Story | **Points:** 5\n\nThe ticket has been added to your sprint backlog. You can view and refine it in the Sprint Planner.\n\nWould you like me to:\n• Add more detailed acceptance criteria to the ticket?\n• Create additional tickets for sub-tasks?\n• Update this document with implementation notes?`;
  } else if (cmdLower.includes('update') || cmdLower.includes('rewrite') || cmdLower.includes('revise') || cmdLower.includes('edit')) {
    action = 'update';
    const baseContent = documentContent ?? '';
    updatedContent = `${baseContent}\n\n---\n*[Updated by AI Assistant — ${new Date().toLocaleDateString()}]*\n\nApplied changes based on your command: "${command}"\n\nRevisions incorporate insights from ${uploadedFiles.length} uploaded file(s).${uploadedFiles.length > 0 ? `\n\nKey changes from uploaded documents:\n${uploadedFiles.map((f) => `• ${f.name}: relevant context extracted and applied`).join('\n')}` : ''}`;
    response = `✅ Document updated successfully.\n\nI've applied the following changes to **${documentTitle ?? 'the document'}**:\n\n1. Incorporated context from your command\n2. ${uploadedFiles.length > 0 ? `Cross-referenced ${uploadedFiles.length} uploaded file(s)` : 'Applied general revision'}\n3. Preserved existing structure and formatting\n\nThe document has been updated in the viewer. You can review the changes and ask me to refine further.${fileContext}`;
  } else if (cmdLower.includes('summary') || cmdLower.includes('summarize') || cmdLower.includes('summarise')) {
    response = `## Summary of **${documentTitle ?? 'Document'}**\n\n${documentContent ? `**Core Content:**\n${documentContent.slice(0, 300).replace(/#+/g, '').trim()}...\n\n` : ''}**Key Points:**\n1. Document covers product requirements and specifications\n2. Defines target users and success metrics\n3. Outlines functional and non-functional requirements\n4. Includes open questions and out-of-scope items\n\n**Status:** Ready for review${fileContext}`;
  } else if (cmdLower.includes('add') && (cmdLower.includes('acceptance') || cmdLower.includes('criteria') || cmdLower.includes('ac'))) {
    action = 'update';
    updatedContent = `${documentContent ?? ''}\n\n## Acceptance Criteria\n\n### Scenario 1: Happy Path\n- **Given** I am an authenticated user\n- **When** I complete the primary action\n- **Then** the system responds correctly within 3 seconds\n- **And** I receive clear confirmation\n\n### Scenario 2: Error Handling\n- **Given** an error occurs\n- **When** the action fails\n- **Then** I see a helpful error message with next steps\n\n### Scenario 3: Edge Cases\n- **Given** I use the feature under unusual conditions\n- **When** I perform the action\n- **Then** the system handles it gracefully`;
    response = `✅ Acceptance criteria added to **${documentTitle ?? 'the document'}**.\n\nI've appended 3 acceptance criteria scenarios (Happy Path, Error Handling, Edge Cases) following Gherkin format. Review the document panel to see the additions.`;
  } else if (cmdLower.includes('user stor') || cmdLower.includes('user storie')) {
    action = 'update';
    updatedContent = `${documentContent ?? ''}\n\n## User Stories\n\n**Story 1:** As a product user, I want to complete my core task efficiently, so that I can achieve my goal without friction.\n\n**Acceptance Criteria:**\n- Given I am logged in, when I access the feature, then it loads in under 2 seconds\n- Given I complete the action, then I receive visual confirmation\n\n**Story Points:** 5 | **Priority:** High\n\n---\n\n**Story 2:** As a team lead, I want visibility into team activity, so that I can manage progress effectively.\n\n**Acceptance Criteria:**\n- Given I have team lead access, when I view the dashboard, then I see all team metrics\n\n**Story Points:** 3 | **Priority:** Medium`;
    response = `✅ User stories added to **${documentTitle ?? 'the document'}**.\n\nI've added 2 user stories with acceptance criteria and story point estimates. You can ask me to add more or refine specific stories.`;
  } else if (cmdLower.includes('risk') || cmdLower.includes('assumption')) {
    response = `## Risks & Assumptions for **${documentTitle ?? 'this document'}**\n\n### Risks\n| Risk | Likelihood | Impact | Mitigation |\n|------|-----------|--------|------------|\n| Engineering capacity constraints | Medium | High | Identify dependencies early, parallelize where possible |\n| Scope creep from stakeholders | High | Medium | Lock scope after PRD approval, use change request process |\n| Third-party API changes | Low | High | Abstract integrations behind interfaces, monitor changelogs |\n\n### Assumptions\n1. Engineering team velocity remains at ~30 points/sprint\n2. Design resources available from Sprint start\n3. Staging environment matches production parity\n4. Customer feedback data is representative of all user segments\n\n*Would you like me to update the document with these risks?*${fileContext}`;
  } else if (cmdLower.includes('competitor') || cmdLower.includes('market') || cmdLower.includes('analysis')) {
    response = `## Competitive Analysis\n\n| Capability | Our Product | Competitor A | Competitor B | Competitor C |\n|-----------|-------------|-------------|-------------|-------------|\n| Core Feature | ✅ | ✅ | ✅ | ❌ |\n| AI-Powered | ✅ | ❌ | ✅ | ❌ |\n| Enterprise SSO | 🔜 | ✅ | ✅ | ✅ |\n| Export Options | 🔜 | ✅ | ❌ | ✅ |\n| Mobile App | ❌ | ✅ | ❌ | ✅ |\n\n**Opportunity:** Our AI-powered approach is a differentiator. Closing the export and SSO gaps removes the two most common sales objections.\n\n*Ask me to add this analysis to the document.*${fileContext}`;
  } else if (cmdLower.includes('generate') || cmdLower.includes('create') || cmdLower.includes('write')) {
    const docType = cmdLower.includes('prd') ? 'PRD' : cmdLower.includes('user stor') ? 'User Stories' : 'document';
    response = `## Generated ${docType}\n\nI've analysed your command and ${uploadedFiles.length > 0 ? `the ${uploadedFiles.length} uploaded file(s)` : 'available context'} to generate the following:\n\n**Title:** ${documentTitle ?? 'New Document'}\n\n**Overview:** This ${docType} captures the key requirements identified from ${uploadedFiles.length > 0 ? `the uploaded documents (${uploadedFiles.map((f) => f.name).join(', ')})` : 'your workspace context'}.\n\n**Core Requirements:**\n1. Primary functionality as described in source materials\n2. Integration with existing systems\n3. Performance and reliability standards\n4. Security and compliance requirements\n\n*Would you like me to expand any section or save this as a new document?*${fileContext}`;
  } else {
    response = `I understand you'd like to: **"${command}"**\n\nHere's what I can help you with for **${documentTitle ?? 'your documents'}**:\n\n📝 **Document Actions:**\n• "Update the PRD with [change]" — modifies the current document\n• "Add acceptance criteria" — appends AC in Gherkin format\n• "Add user stories" — generates user stories with estimates\n• "Summarize this document" — gives a quick overview\n\n🎫 **Sprint Actions:**\n• "Create a sprint ticket from this document" — adds a ticket to your backlog\n\n📊 **Analysis:**\n• "Analyze risks and assumptions"\n• "Create a competitive analysis"\n• "Generate a new PRD based on uploaded files"\n\nYou can also upload reference documents (PDF, DOCX, TXT) and I'll use them as context for any command.${fileContext}`;
  }

  await streamText(response, onChunk);
  return { action, updatedContent, ticketData };
}
