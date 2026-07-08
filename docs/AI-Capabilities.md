# AI Capabilities — PMAI

## Document Info

| Field | Detail |
|---|---|
| Version | 3.0 |
| Status | Final |
| Source | Built application (src/ai/index.ts) |
| Date | 2026-07-08 |

---

## Overview

This document details every AI-powered capability in PMAI, organised by the PM workflow step they serve.

The system uses two distinct approaches:
1. **Deterministic keyword matching** for theme detection — zero hallucination, fully grounded in actual feedback text
2. **Anthropic Claude (`claude-sonnet-4-6`)** for all generative content (summaries, PRDs, briefs, Q&A)

```
Theme Detection (keyword) → Insight Generation (LLM) → Document Generation (LLM) → Sprint Brief (LLM + SSE)
```

---

## 1. Feedback Intelligence

### 1.1 Theme & Pattern Detection — Keyword-Based

**Purpose:** Cluster raw customer feedback into named themes without hallucination.

**Where used:** `POST /api/feedback/analyse-existing` → called when PM clicks "Analyse Feedback"

**Method:** Deterministic keyword matching against a curated dictionary. No LLM call is made for theme assignment.

```typescript
const THEME_KEYWORDS: Record<string, string[]> = {
  'Onboarding friction':   ['onboarding', 'setup wizard', 'getting started', 'new user',
                            'empty state', 'guided setup', 'initial setup', 'sign up'],
  'Reporting & exports':   ['export', 'confluence', 'notion', 'pdf export',
                            'copy-paste', 'formatting issues'],
  'Performance issues':    ['performance', 'lag', 'latency', 'timeout', 'crashes',
                            'freeze', 'unresponsive', 'too slow', 'runs slow'],
  'Integration requests':  ['integration', 'integrate', 'slack', 'jira', 'github',
                            'webhook', 'zapier', 'salesforce', 'api access'],
  'Mobile experience':     ['mobile', 'ios', 'android', 'phone', 'tablet', 'app store'],
  'Dashboard UX':          ['dashboard', 'navigation menu', 'ui design', 'user interface'],
  'Permissions & access':  ['permission', 'invite teammate', 'inviting teammate',
                            'access control', 'user role', 'admin role'],
  'Sprint planning':       ['sprint planner', 'sprint brief', 'sprint planning',
                            'grooming', 'backlog', 'story points'],
  'Billing & pricing':     ['billing', 'pricing', 'upgrade to paid', 'paid plan',
                            'subscription cost'],
  'Notification settings': ['notification', 'email digest', 'alert settings', 'reminder'],
};
```

**Evidence extraction:**
```typescript
function extractSnippet(text: string, keyword: string): string {
  const sentences = text.split(/(?<=[.!?])\s+|[\n\r]+/);
  const match = sentences.find(s => s.toLowerCase().includes(keyword));
  if (!match) return '';
  const trimmed = match.trim();
  return trimmed.length > 160 ? trimmed.slice(0, 157) + '…' : trimmed;
}
```

**Outputs per feedback item:**
| Output | Description |
|---|---|
| Theme name | From THEME_KEYWORDS dictionary |
| Snippet | Exact sentence from the feedback containing the matched keyword |
| Sentiment | Positive / Neutral / Negative (rule-based on language signals) |

**Anti-hallucination guarantee:** `pickThemes()` never returns a random fallback. If no keyword matches, no theme is assigned. The maximum themes per feedback item is 3 (stops at first 3 matches to avoid over-tagging).

**Aggregation (across all items):**
```typescript
const themeCountMap = new Map<string, number>();    // theme → count of items
const themeEvidenceMap = new Map<string, string>(); // theme → first matching snippet
```

---

### 1.2 Sentiment Classification

**Purpose:** Assign polarity to each feedback item for dashboard visualisation.

**Method:** Heuristic scoring based on positive/negative word signals in the feedback text. Result stored as `sentiment` (positive / neutral / negative) and `sentimentScore` (-1 to 1) per feedback item.

---

## 2. Pipeline Generation (LLM — Sequential SSE)

### 2.1 Full Pipeline via `POST /api/feedback/pipeline/commit`

After the PM approves the Pipeline Approval modal, a single SSE endpoint runs the full pipeline in sequence, emitting `progress` events per step:

| Step | What the LLM generates |
|---|---|
| `themes` | Stores theme records in `feedback_themes` table |
| `opportunities` | Creates opportunity summaries per theme |
| `prd` | Full PRD document in Markdown (title, problem, goals, requirements, success criteria) |
| `user_stories` | User stories document per theme |
| `acceptance_criteria` | AC document per theme |
| `roadmap` | Roadmap items linked to themes |
| `sprint` | Sprint with name, goal, start/end dates |
| `done` | Completion signal |

**Prompt strategy for PRD generation:**
```
You are a senior product manager writing a PRD.
Theme: {{theme_name}}
Feedback count: {{count}}
Evidence: "{{snippet}}"

Write a PRD with: Problem Statement, Goals, Requirements (functional + non-functional),
Success Criteria. Ground every section in the customer evidence above.
```

---

## 3. Insight Generation

### 3.1 Data-Backed Insight Summaries

**Purpose:** Generate written narratives anchored in theme volume, sentiment, and verbatim quotes.

**Where used:** Insights page — each theme card.

**Implementation:** `generateInsightSummary()` in `src/ai/index.ts`

**Prompt strategy:**
```
You are a product manager communicating customer insights. Using the theme data below,
write a concise insight summary that: opens with the most important finding, cites
specific data points (volume, severity), includes 1–2 verbatim customer quotes, and
ends with a clear implication for the product.

Theme: {{theme_name}}
Volume: {{count}} items
Quotes: {{evidence_snippet}}
```

---

### 3.2 Natural Language Q&A

**Purpose:** Answer the PM's plain-language questions grounded in actual theme data.

**Where used:** Insights page — "Ask AI" input.

**Implementation:** `answerInsightQuestion()` in `src/ai/index.ts`

---

## 4. Document AI Assistant

### 4.1 Document Generation from Feedback

**Purpose:** Generate PRD, User Story, or Acceptance Criteria from a selected feedback theme, without running the full pipeline.

**Where used:** Documents workspace → "Generate from Feedback" panel.

**Implementation:** `generateDocumentContent()` in `src/ai/index.ts`

---

### 4.2 AI Document Assistant (Chat)

**Purpose:** Answer PM questions about the active document or attached reference documents. Can be instructed to update the PRD, add sections, or synthesise across multiple documents.

**Where used:** Documents workspace → right-side AI assistant panel.

**Implementation:** `answerDocumentQuestion()` in `src/ai/index.ts` — streams via SSE.

**Context:** PM can attach Reference documents (uploaded via 📎 button) to the conversation. The AI receives the full content of attached documents as context.

**Prompt strategy:**
```
You are an AI assistant helping a product manager with their documents.
Active document: {{doc_title}} ({{doc_type}})
Current content: {{doc_content}}

Attached reference documents:
{{attached_doc_1_title}}: {{attached_doc_1_content}}
...

PM's question: {{question}}

Answer grounded in the documents provided. If asked to update the PRD,
return the complete updated content.
```

---

## 5. Roadmap Support

### 5.1 Roadmap Justification Generation

**Purpose:** Generate a written customer-evidence narrative for a roadmap item.

**Where used:** Roadmap item detail → "Generate Justification" action.

**Implementation:** `generateRoadmapJustification()` in `src/ai/index.ts`

---

## 6. Sprint Planning

### 6.1 Sprint Ticket Generation

**Purpose:** Convert a roadmap item into a sprint-ready user story with title, description, acceptance criteria, and story points.

**Where used:** Roadmap → "→ Sprint" button.

**Implementation:** `generateSprintTickets()` in `src/ai/index.ts`

---

### 6.2 Backlog Grooming Detection

**Purpose:** Flag tickets needing attention before development.

**Method:** Rule-based (no LLM):
```typescript
const missingAC = !ticket.acceptance_criteria;
const tooLarge = (ticket.story_points ?? 0) > 13;
const flagged = ticket.needs_grooming || missingAC || tooLarge;
```

---

## 7. Sprint Brief Generation (SSE)

### 7.1 Sprint Brief

**Purpose:** Generate a complete, stakeholder-ready sprint brief from actual sprint ticket data, streamed in real time.

**Where used:** Sprint Planner → "Sprint Brief" button.

**Implementation:** `generateSprintBrief(sprint, tickets, onChunk)` in `src/ai/index.ts`
Streamed via `POST /api/sprint/sprints/:id/brief` using `createSSEStream`.

**Inputs:** Sprint metadata + all `sprint_tickets` rows for that sprint.

**Output (streamed markdown):**
```markdown
## Sprint Brief — {sprint name}
**Period:** {start} → {end}
**Goal:** {goal}

### Scope
{count} user stories · {total_points} story points
Status: {done} done · {in_progress} in progress · {todo} to do

### User Stories
1. **{title}** [{status}, {pts} pts]
   {description}
   AC: {ac preview}

### Readiness Check
{risks or ✓ all ready}

### Success Criteria
- {one per ticket}

*Generated by PMAI · {date}*
```

---

## AI Output Quality Guidelines

| Principle | Application |
|---|---|
| Grounded in data | Theme detection: keywords only. LLM outputs: must cite actual data |
| Zero hallucination | Theme assignment uses deterministic matching — no invented themes |
| Evidence-linked | Pipeline approval shows the exact feedback sentence per theme |
| PM is the author | All AI outputs are drafts; PM edits, approves, and saves every artefact |
| Traceable | Sprint briefs read from actual DB ticket rows, not summaries |
| Streaming first | Long-form outputs stream progressively via SSE |
