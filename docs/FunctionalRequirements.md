# Functional Requirements — AI Assistant for Product Managers (PMAI)

## Document Info

| Field | Detail |
|---|---|
| Version | 3.1 |
| Status | Final |
| Source | Problem Discovery.md, built application |
| Date | 2026-07-17 |

---

## Core Flow

All functional requirements map to the end-to-end PM flow:

```
Feedback Hub → Insights → Documents (PRD / Specs) → Roadmap → Sprint Planner → Sprint Brief → Ship
```

Supporting layer: Knowledge Base (context for AI across all steps)

---

## 1. Feedback Hub

### FR-1.1 Feedback Ingestion
The system shall allow PMs to upload raw customer feedback (emails, support tickets, NPS notes, interview transcripts). Each upload is stored as individual feedback items in the database.

### FR-1.2 AI Theme Clustering — Keyword-Based, Zero Hallucination
The system shall automatically cluster feedback entries into named themes using a deterministic keyword-matching algorithm. Themes are only returned when a keyword from the THEME_KEYWORDS dictionary is found in the feedback text. Each theme shall include:
- A descriptive theme name
- Count of supporting feedback items
- A verbatim evidence snippet — the exact sentence from the feedback that triggered the theme match
- No random or invented themes shall ever be produced

### FR-1.3 Re-Analyse at Any Time
The "Analyse Feedback" button shall always be visible when feedback exists in the system, regardless of whether a prior analysis has been run. PMs shall be able to re-run analysis at any point.

### FR-1.4 Pipeline Approval with Evidence
Before committing AI-generated artefacts, the system shall present a Pipeline Approval modal that shows:
- Each detected theme with its feedback count
- The verbatim sentence from the feedback that triggered each theme, displayed beneath the theme name
PMs may edit the PRD title and Sprint name before approving. Approval triggers the full pipeline: PRD, User Stories, Acceptance Criteria, Roadmap items, Sprint, and Tickets.

### FR-1.5 Theme Dashboard
The system shall display detected themes on the Overview dashboard ranked by volume, with direct links to the Insights page and Documents workspace.

---

## 2. Insights

### FR-2.1 AI Insight Summaries
The system shall generate written summaries for each feedback theme citing specific data points (volume, evidence quotes) suitable for stakeholder communication.

### FR-2.2 Natural Language Q&A
The PM shall be able to ask plain-language questions about feedback data via the Insights AI assistant and receive grounded answers.

### FR-2.3 Theme Overview
The Insights page shall list all themes with item counts, top evidence quote, and links to generate documents or roadmap items.

---

## 3. Documents

### FR-3.1 Document Library
The system shall maintain a document library per product area containing:
- AI-generated PRDs, User Stories, and Acceptance Criteria (types: PRD / UserStory / AcceptanceCriteria)
- PM-uploaded reference documents (type: Reference — accepts PDF, DOCX, TXT, MD, CSV, XLSX, PPTX)

### FR-3.2 Inline Document Editing
PMs shall be able to edit any document directly within the Documents workspace:
- An **Edit** button (yellow) switches the document viewer to an editable textarea pre-filled with the current content
- The PM may edit freely
- A **Save** button (green) commits the changes; a **Cancel** button discards them
- After saving, the view returns to the read-mode `<pre>` showing the updated content

### FR-3.3 Automatic Version History on Every Save
Every time a document is saved via the Edit → Save flow, the system shall automatically save a version snapshot of the content before applying the update. No manual version creation is required.

### FR-3.4 Version History Panel
A **History** button in the document header shall open a version panel listing all prior versions with:
- Version number
- Save date
- A **Restore** button per version

### FR-3.5 Version Restore
Clicking Restore shall save the current document as a new version before replacing the content with the restored version, ensuring no content is ever lost.

### FR-3.6 Document Upload Inside AI Assistant
PMs shall be able to upload reference documents directly from the AI assistant input bar via a 📎 button. Uploaded documents shall be:
- Stored as Reference-type documents in the document library
- Automatically attached as context for the current AI conversation
- Available for the AI to read and use when updating the active PRD

### FR-3.7 AI Document Assistant
Each document shall have an AI assistant chat panel. The PM can instruct the AI to:
- Analyse an attached reference document and summarise it
- Update the current PRD with new content
- Add acceptance criteria or user stories
- Compare or synthesise across multiple attached documents
The AI shall use attached Reference documents as context when generating responses.

### FR-3.8 Agent Running Indicator
The Documents tab shall display a yellow banner with a pulsing dot whenever a background agent or pipeline is running (triage agent from Agent Center, or the Feedback Pipeline). The banner text shall identify the active agent by name (e.g. "Feedback Pipeline running…"). The banner clears automatically when the agent completes.

### FR-3.9 Generate from Feedback
From the Documents workspace, PMs shall be able to select any feedback theme and document type (PRD / User Story / Acceptance Criteria) and generate a new AI document instantly without running the full pipeline.

---

## 4. Roadmap

### FR-4.1 Roadmap Item Management
The system shall allow PMs to create, edit, and prioritise roadmap items with status: `backlog` → `planned` → `in_progress` → `done` and linkage to a source feedback theme.

### FR-4.2 PRD Auto-Draft on Status Change to Planned
When a PM moves a roadmap item from any status to `planned`, the system shall automatically create a PRD draft document (`type: PRD`, title: `PRD Draft: {item title}`) in the Documents workspace without any additional PM action. Duplicate PRD drafts for the same roadmap item shall not be created if one already exists. The Documents tab shall show a banner:
- "Agent drafting PRD · please wait…" (purple, pulsing) while the PRD draft is being prepared
- "PRD draft ready · review below" (green) once the draft document is present in the library

### FR-4.3 Customer Evidence Linkage
Every roadmap item shall display its originating feedback theme and volume so PMs can always answer "why are we building this?" with data.

### FR-4.4 One-Click Sprint Push
From any roadmap item, the PM shall be able to push it to a sprint as a user story, pre-filling title, description, and acceptance criteria.

### FR-4.5 Priority Ordering
The system shall allow PMs to reorder roadmap items by priority rank.

---

## 5. Sprint Planner

### FR-5.1 Multi-Sprint Management
The system shall support multiple concurrent and sequential sprints per product area. PMs shall be able to create, rename, and switch between sprints.

### FR-5.2 User Story Management
Each sprint shall contain tickets with title, description, type, status, story points, acceptance criteria, and grooming flag.

### FR-5.3 Move Tickets Between Sprints
The PM shall be able to move any ticket from one sprint to another.

### FR-5.4 Backlog Grooming Assistance
The system shall automatically flag tickets missing acceptance criteria, with story points > 13, or marked as needing grooming. Flagged tickets appear in a "Needs Grooming" tab.

### FR-5.5 Inline Ticket Editing
PMs shall be able to edit all ticket fields inline without leaving the sprint view.

### FR-5.6 Sprint Progress Tracking
The sprint view shall display total story points committed, points completed, progress percentage, and sprint goal.

---

## 6. Sprint Brief

### FR-6.1 AI Sprint Brief Generation
The system shall generate a structured sprint brief from the actual tickets in the active sprint, including: sprint goal, scope summary, user story list with AC preview, readiness check, and success criteria.

### FR-6.2 Real-Time Streaming
The sprint brief shall stream to the PM in real time via Server-Sent Events (SSE).

### FR-6.3 Per-Sprint Briefs
Each sprint shall have its own independently generated brief.

---

## 7. Knowledge Base

### FR-7.1 Document Storage
The system shall maintain a searchable library of PRDs, research documents, competitor analysis, and design specs.

### FR-7.2 AI Context Layer
Knowledge Base documents shall be available as context to AI generation across all modules.

---

## 8. User & Access Management

### FR-8.1 Role-Based Access
Roles: PM (full access), Product Leader (read across areas), Scrum Master / Eng Lead (sprint tickets only).

### FR-8.2 Multi-Product Workspace
The system shall support multiple product lines via a Product Area switcher.

### FR-8.3 JWT Authentication
JWT tokens stored in `localStorage`, required on all API requests.

---

## 9. Integrations (Phase 2)

Export to Jira, Linear, Notion. Connectors for Zendesk, Intercom, NPS, Gong. Document export to PDF, Markdown, Confluence, Notion.

---

## 10. Non-Functional Requirements

| Requirement | Detail |
|---|---|
| AI streaming latency | First token ≤ 2 seconds; full response streams progressively |
| Theme hallucination | Zero — themes grounded exclusively in keyword matches |
| Version integrity | Every save preserves prior version; no content loss |
| Data privacy | PII masked before reaching LLM |
| Availability | 99.5% uptime SLA |
| Auditability | All AI content tagged with model version and timestamp |

---

## Traceability Matrix

| Pain Point | Functional Requirements |
|---|---|
| Feedback Overload | FR-1.1, FR-1.2, FR-1.3 |
| AI Hallucination | FR-1.2, FR-1.4 |
| Slow Insight Generation | FR-2.1, FR-2.2 |
| Document Editing & Versioning | FR-3.1 – FR-3.8 |
| Roadmap Uncertainty | FR-4.1 – FR-4.4 |
| Sprint Planning Inefficiency | FR-5.1 – FR-5.6 |
| Stakeholder Communication | FR-6.1 – FR-6.3 |
| Knowledge Silos | FR-7.1, FR-7.2 |
