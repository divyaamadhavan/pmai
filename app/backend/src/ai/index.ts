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

export type { ThemeMatch };

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

export async function generateInsightSummary(
  audience: string, _tenantId: string, _productAreaId: string | undefined, onChunk: ChunkCallback
): Promise<void> {
  await streamText(
    `## Customer Insight Summary - ${audience} Audience\n\nPeriod: Last 30 days | Total Feedback: 1,284 items | Channels: 5\n\n### Top Opportunities\n\n1. Onboarding Friction (312 items, 78% negative) - New users struggle with initial project setup. Average time-to-first-value is 47 minutes vs benchmark of 12 minutes.\n\n2. Reporting and Exports (198 items, 71% negative) - Users cannot export data to CSV without a workaround. Blocking 3 enterprise deals.\n\n3. Integration Requests (156 items, 55% neutral) - Slack, Jira, and Google Sheets are the top-requested connectors.\n\n### Recommended Priorities\n- Next Sprint: CSV export (high evidence, low effort)\n- Sprint +1: Guided onboarding (high evidence, medium effort)\n- Q3: Slack integration (medium evidence, medium effort)`,
    onChunk
  );
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
