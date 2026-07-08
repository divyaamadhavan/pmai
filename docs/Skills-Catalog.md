# Skills Catalog — PMAI

## Document Info

| Field | Detail |
|---|---|
| Version | 3.0 |
| Status | Final |
| Source | Built application (src/ai/index.ts) |
| Date | 2026-07-08 |

---

## What is a Skill?

A skill is a single, reusable AI capability (or deterministic computation) that takes a defined input, runs a focused operation, and returns a defined output. Skills are the building blocks that agents compose together. Each skill does exactly one thing well.

---

## Skill Index

| ID | Skill Name | Method | Workflow Step | Status |
|---|---|---|---|---|
| SK-01 | Keyword-Based Theme Detection | Deterministic | Feedback Hub | ✓ Built |
| SK-02 | Evidence Snippet Extraction | Deterministic | Feedback Hub | ✓ Built |
| SK-03 | Sentiment Classification | Rule-based | Feedback Hub | ✓ Built |
| SK-04 | Store Themes | DB write | Pipeline | ✓ Built |
| SK-05 | Opportunity Creation | LLM | Pipeline | ✓ Built |
| SK-06 | PRD Generation | LLM | Pipeline / Documents | ✓ Built |
| SK-07 | User Story Generation | LLM | Pipeline / Documents | ✓ Built |
| SK-08 | Acceptance Criteria Generation | LLM | Pipeline / Documents | ✓ Built |
| SK-09 | Data-Backed Insight Summary | LLM | Insights | ✓ Built |
| SK-10 | Natural Language Feedback Q&A | LLM | Insights | ✓ Built |
| SK-11 | Document Generation from Feedback | LLM | Documents | ✓ Built |
| SK-12 | Document Version Snapshot | DB write | Documents | ✓ Built |
| SK-13 | Document AI Assistant (Chat) | LLM + SSE | Documents | ✓ Built |
| SK-14 | Roadmap Justification Generation | LLM | Roadmap | ✓ Built |
| SK-15 | Sprint Ticket Generation | LLM | Sprint Planner | ✓ Built |
| SK-16 | Sprint AC Generation | LLM | Sprint Planner | ✓ Built |
| SK-17 | Backlog Grooming Detection | Rule-based | Sprint Planner | ✓ Built |
| SK-18 | Sprint Brief Generation | LLM + SSE | Sprint Brief | ✓ Built |
| SK-19 | Knowledge Base Q&A | LLM | Knowledge Base | ✓ Built |
| SK-20 | Tradeoff Comparison | LLM | Roadmap | Phase 2 |
| SK-21 | Prioritisation Scoring | LLM | Roadmap | Phase 2 |
| SK-22 | Dependency Mapping | LLM | Sprint Planner | Phase 2 |

---

## Skill Definitions

---

### SK-01 — Keyword-Based Theme Detection

**Description**
Assigns named themes to a feedback item by matching its text against a curated keyword dictionary. Returns only themes for which a keyword is found. Zero hallucination — no LLM is used for theme assignment.

**Input**
- Feedback item text (string)

**Output**
- `ThemeMatch[]`: array of `{ name: string; snippet: string }` (max 3 per item)
- Returns empty array if no keywords match

**Implementation**
```typescript
function pickThemes(text: string): ThemeMatch[] {
  const lower = text.toLowerCase();
  const matched: ThemeMatch[] = [];
  for (const [theme, keywords] of Object.entries(THEME_KEYWORDS)) {
    const hitKeyword = keywords.find(k => lower.includes(k));
    if (hitKeyword) matched.push({ name: theme, snippet: extractSnippet(text, hitKeyword) });
    if (matched.length === 3) break;
  }
  return matched;
}
```

**File:** `src/ai/index.ts` → `pickThemes()`

---

### SK-02 — Evidence Snippet Extraction

**Description**
Extracts the exact sentence from a feedback item that contains a matched keyword. This verbatim excerpt is shown in the Pipeline Approval Modal under each theme so PMs can verify the AI's reasoning.

**Input**
- Full feedback text (string)
- Matched keyword (string)

**Output**
- Sentence containing the keyword, truncated to 160 chars with ellipsis

**Implementation**
```typescript
function extractSnippet(text: string, keyword: string): string {
  const sentences = text.split(/(?<=[.!?])\s+|[\n\r]+/);
  const match = sentences.find(s => s.toLowerCase().includes(keyword.toLowerCase()));
  if (!match) return '';
  const trimmed = match.trim();
  return trimmed.length > 160 ? trimmed.slice(0, 157) + '…' : trimmed;
}
```

**File:** `src/ai/index.ts` → `extractSnippet()`

---

### SK-03 — Sentiment Classification

**Description**
Assigns polarity (Positive / Neutral / Negative) and a sentiment score to each feedback item.

**Input**
- Feedback item text (string)

**Output**
- `sentiment`: 'positive' | 'neutral' | 'negative'
- `sentimentScore`: number (-1 to 1)

**Method:** Heuristic word-signal scoring. No LLM call.

**File:** `src/ai/index.ts` → `analyseFeedback()`

---

### SK-04 — Store Themes

**Description**
Persists approved themes into the `feedback_themes` table after PM approval.

**Input**
- `themes[]`, `themeCounts[]`, `productAreaId`, `tenantId`

**Output**
- Theme rows in DB; theme IDs returned for downstream pipeline steps

**File:** `src/services/feedback/router.ts` → `/pipeline/commit` handler, step `themes`

---

### SK-05 — Opportunity Creation

**Description**
Generates a brief opportunity summary for each theme describing the business case.

**Input**
- Theme name, evidence count, feedback context

**Output**
- Opportunity summary text (stored in roadmap context)

**Method:** LLM (Anthropic Claude)

---

### SK-06 — PRD Generation

**Description**
Generates a full Product Requirements Document in Markdown from a set of themes and their evidence.

**Input**
- PRD title (PM-editable in approval modal)
- Themes with counts and evidence snippets

**Output**
- Markdown PRD with: Problem Statement, Goals, Functional Requirements, Non-Functional Requirements, Success Criteria

**Method:** LLM (Anthropic Claude)

**File:** `src/ai/index.ts` → `generateDocumentContent('PRD', ...)`

---

### SK-07 — User Story Generation

**Description**
Generates user stories document from theme context.

**Input**
- Themes, evidence, product area context

**Output**
- Markdown user stories document (stored as type: UserStory)

**Method:** LLM (Anthropic Claude)

---

### SK-08 — Acceptance Criteria Generation

**Description**
Generates testable acceptance criteria for a set of themes or a specific user story.

**Input**
- Theme / user story context

**Output**
- Markdown AC document (stored as type: AcceptanceCriteria)

**Method:** LLM (Anthropic Claude)

---

### SK-09 — Data-Backed Insight Summary

**Description**
Generates a written insight narrative for a feedback theme, anchored in volume, sentiment, and customer language.

**Input**
- Theme name, item count, evidence snippet, severity

**Output**
- 2–3 paragraph narrative with evidence citations

**Method:** LLM (Anthropic Claude)

**File:** `src/ai/index.ts` → `generateInsightSummary()`

---

### SK-10 — Natural Language Feedback Q&A

**Description**
Answers a PM's plain-language question about customer feedback data, grounded in the actual themes.

**Input**
- PM's free-text question
- Current themes with counts and evidence

**Output**
- Grounded answer with evidence citations and follow-up questions

**Method:** LLM (Anthropic Claude)

**File:** `src/ai/index.ts` → `answerInsightQuestion()`

---

### SK-11 — Document Generation from Feedback

**Description**
Generates a PRD, User Story, or Acceptance Criteria document from a selected feedback theme, without running the full pipeline.

**Input**
- Theme name, doc type ('PRD' | 'UserStory' | 'AcceptanceCriteria')
- Feedback count and evidence

**Output**
- Markdown document stored in the `documents` table

**Method:** LLM (Anthropic Claude)

**File:** `src/services/documents/router.ts` → `POST /api/documents/generate`

---

### SK-12 — Document Version Snapshot

**Description**
Saves the current document content as a version entry before any update. Called automatically inside `withTransaction` on every `PUT /api/documents/:id`.

**Input**
- Document ID
- Current `sections` value

**Output**
- New row in `document_versions` with auto-incremented `version` number

**Method:** DB write (no AI). Never requires explicit PM action.

**File:** `src/services/documents/router.ts` → `PUT /:id` handler

---

### SK-13 — Document AI Assistant (Chat)

**Description**
Answers PM questions about the active document and any attached reference documents. Can update the PRD content when instructed. Streams response via SSE.

**Input**
- PM's question (string)
- Active document: title, type, `sections.content`
- Attached Reference documents: title + `sections.content` per doc

**Output**
- Streamed answer (SSE). If the PM asks to update the PRD, returns the complete updated content for the PM to save.

**Method:** LLM (Anthropic Claude) + SSE streaming

**File:** `src/services/documents/router.ts` → `POST /api/documents/:id/ask`  
**Frontend:** `DocumentWorkspace.tsx` → AI assistant chat panel

---

### SK-14 — Roadmap Justification Generation

**Description**
Generates a written customer-evidence narrative for a prioritised roadmap item, suitable for leadership communication.

**Input**
- Roadmap item title, description
- Linked feedback theme: name, count, evidence snippet

**Output**
- 1–2 paragraph justification narrative

**Method:** LLM (Anthropic Claude)

**File:** `src/ai/index.ts` → `generateRoadmapJustification()`

---

### SK-15 — Sprint Ticket Generation

**Description**
Converts a roadmap item into a sprint-ready user story with title, description, story points, and calls SK-16 for acceptance criteria.

**Input**
- Roadmap item title and description
- Linked feedback theme context

**Output**
- Ticket title in "[STORY] Address: {item}" format
- Description contextualising the user problem
- Suggested story points (Fibonacci scale)
- Type: story / task / bug

**Method:** LLM (Anthropic Claude)

**File:** `src/ai/index.ts` → `generateSprintTickets()`

---

### SK-16 — Sprint AC Generation

**Description**
Generates 3 testable acceptance criteria for a user story in plain language.

**Input**
- Ticket title and description

**Output**
- JSON array of 3 acceptance criteria strings

**Method:** Called within SK-15 (LLM)

---

### SK-17 — Backlog Grooming Detection

**Description**
Automatically flags tickets needing attention before development. Rule-based — no LLM.

**Input**
- Sprint tickets (title, story_points, acceptance_criteria, needs_grooming)

**Output**
- Per-ticket flag: READY / MISSING_AC / TOO_LARGE / NEEDS_GROOMING
- Flagged tickets surfaced in "Needs Grooming" tab

**Method:** Rule-based computation:
```typescript
const missingAC = !ticket.acceptance_criteria;
const tooLarge = (ticket.story_points ?? 0) > 13;
const flagged = ticket.needs_grooming || missingAC || tooLarge;
```

---

### SK-18 — Sprint Brief Generation

**Description**
Generates a complete, stakeholder-ready sprint brief from actual sprint ticket data, streamed in real time via SSE.

**Input**
- Sprint metadata (name, goal, start_date, end_date)
- All sprint tickets (title, description, status, story_points, acceptance_criteria, needs_grooming)

**Output (streamed markdown)**
- Sprint header, scope summary, user story list with AC preview, readiness check, success criteria, timestamp

**Method:** LLM (Anthropic Claude) + SSE streaming

**File:** `src/ai/index.ts` → `generateSprintBrief(sprint, tickets, onChunk)`  
Endpoint: `POST /api/sprint/sprints/:id/brief`

---

### SK-19 — Knowledge Base Q&A

**Description**
Answers a PM's natural-language question about documents stored in the Knowledge Base, grounded in actual document content with source citations.

**Input**
- PM's free-text question
- Knowledge base document excerpts

**Output**
- Grounded answer with document source citations
- 2–3 suggested follow-up questions

**Method:** LLM (Anthropic Claude)

**File:** `src/services/knowledge/router.ts`

---

## Phase 2 Skills (Planned)

| ID | Skill | Purpose |
|---|---|---|
| SK-20 | Tradeoff Comparison Generation | Side-by-side comparison of competing roadmap options with evidence |
| SK-21 | Evidence-Based Prioritisation Scoring | Score and rank roadmap items by customer evidence volume and severity |
| SK-22 | Dependency Mapping | Identify dependencies between tickets in a sprint or backlog |

---

## Skills × Workflow Matrix

| Skill | Feedback | Pipeline | Insights | Documents | Roadmap | Sprint | Sprint Brief | KB |
|---|---|---|---|---|---|---|---|---|
| SK-01 Keyword Detection | ✓ | | | | | | | |
| SK-02 Evidence Snippet | ✓ | | | | | | | |
| SK-03 Sentiment | ✓ | | | | | | | |
| SK-04 Store Themes | | ✓ | | | | | | |
| SK-05 Opportunities | | ✓ | | | | | | |
| SK-06 PRD Gen | | ✓ | | ✓ | | | | |
| SK-07 User Stories | | ✓ | | ✓ | | | | |
| SK-08 AC Gen | | ✓ | | ✓ | | | | |
| SK-09 Insight Summary | | | ✓ | | | | | |
| SK-10 NL Q&A | | | ✓ | | | | | |
| SK-11 Doc Gen | | | | ✓ | | | | |
| SK-12 Doc Version | | | | ✓ | | | | |
| SK-13 Doc AI Chat | | | | ✓ | | | | |
| SK-14 Justification | | | | | ✓ | | | |
| SK-15 Ticket Gen | | | | | | ✓ | | |
| SK-16 Sprint AC | | | | | | ✓ | | |
| SK-17 Grooming | | | | | | ✓ | | |
| SK-18 Sprint Brief | | | | | | | ✓ | |
| SK-19 KB Q&A | | | | | | | | ✓ |

---

*End of Skills Catalog*
