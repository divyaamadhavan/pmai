# System Architecture — PMAI (AI Assistant for Product Managers)

## Document Info

| Field | Detail |
|---|---|
| Version | 3.1 |
| Status | Final |
| Date | 2026-07-17 |
| Source | Built application |

---

## 1. Architecture Overview

PMAI is a full-stack TypeScript application following a **monolith-first architecture** with clear separation between frontend, backend API, and AI orchestration. The system is organised around a single end-to-end PM workflow:

```
Feedback Hub → Insights → Documents → Roadmap → Sprint Planner → Sprint Brief → Ship
```

```
┌───────────────────────────────────────────────────────────────┐
│                     Frontend (React + Vite)                    │
│    SPA organised by PM workflow steps · SSE streaming UI       │
├───────────────────────────────────────────────────────────────┤
│                  Backend API (Express + TypeScript)            │
│   REST routes · JWT auth · SSE streaming · per-module routers  │
├───────────────────────────────────────────────────────────────┤
│                    AI Orchestration Layer                       │
│   Keyword-based theme detection · Anthropic Claude SDK · SSE   │
├───────────────────────────────────────────────────────────────┤
│                      Data Layer (SQLite)                        │
│   better-sqlite3 · multi-tenant via tenant_id + product_area   │
└───────────────────────────────────────────────────────────────┘
```

---

## 2. Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, TailwindCSS |
| State / Data fetching | TanStack React Query (`@tanstack/react-query`) |
| UI components | Lucide React (icons), custom neon dark theme |
| Backend | Express.js, TypeScript, Node.js |
| Database | SQLite via `better-sqlite3` |
| AI / LLM | Anthropic Claude (`claude-sonnet-4-6`) via `@anthropic-ai/sdk` |
| Theme detection | Deterministic keyword matching (no LLM — zero hallucination) |
| Streaming | Server-Sent Events (SSE) — custom `SSEStream` helper |
| Authentication | JWT (`jsonwebtoken`) — tokens stored in `localStorage` |
| HTTP client (frontend) | Axios (`apiClient`) |

---

## 3. Frontend Architecture

### Structure
```
src/
├── pages/
│   ├── Dashboard.tsx           ← overview, pipeline status cards
│   ├── FeedbackHub.tsx         ← upload, analyse, pipeline approval
│   ├── Insights.tsx            ← theme summaries, AI Q&A
│   ├── DocumentWorkspace.tsx   ← doc library, inline edit, versions, AI assistant, agent banner
│   ├── RoadmapBoard.tsx        ← kanban board with status change dropdown
│   ├── AgentCenter.tsx         ← run agents (triage, etc.); sets AgentStatusContext on run
│   ├── SprintPlanner.tsx
│   └── KnowledgeBase.tsx
├── components/
│   ├── PipelineApprovalModal.tsx  ← shows theme evidence, runs pipeline via SSE
│   ├── StreamingText.tsx
│   ├── Modal.tsx
│   └── LoadingSpinner.tsx
├── contexts/
│   ├── ProjectContext.tsx      ← active product area
│   └── AgentStatusContext.tsx  ← global agent/pipeline running state (banner coordination)
├── lib/
│   ├── api.ts                  ← Axios instance + fetchSSEPost helper
│   └── auth.ts
└── App.tsx                     ← route definitions; wraps tree in AgentStatusProvider
```

### Key Patterns

**React Query** — all server state. Every query uses `useQuery`; mutations use `useMutation` with `queryClient.invalidateQueries`.

**AgentStatusContext** — a global React context (`AgentStatusContext.tsx`) that tracks whether any agent or pipeline is currently running. It exposes `setAgentRunning(label)` and `clearAgentRunning()`. Callers: `AgentCenter.tsx` (triage/custom agents) and `PipelineApprovalModal.tsx` (feedback pipeline). Consumer: `DocumentWorkspace.tsx` shows a yellow "running" banner and increases its polling interval while any agent is active.

**SSE Streaming** (`fetchSSEPost`):
- Opens an SSE connection via POST body
- `onEvent(eventName, data)` handler receives typed events (`progress`, `done`, `error`)
- `cancelled` flag in `useEffect` cleanup prevents StrictMode double-fire

**Document Workspace state model:**
- `selectedDoc` — currently open document
- `isEditing` / `editContent` / `isSaving` — inline edit state
- `showVersions` — version history panel toggle
- `attachedDocs` — documents attached as AI context
- `messages` — AI assistant chat history
- `prdAgentActive` — true when any roadmap item has status `planned`; drives a "drafting PRD" banner and polling; checked via `roadmap-planned-check` query (polls all planned items tenant-wide, no product area filter)
- `agentRunning` / `agentLabel` — read from `AgentStatusContext`; drives yellow "running" banner when a background agent is active

**sections parsing** — The backend stores `sections` as a JSON string in SQLite. The frontend parses it on read: `typeof sections === 'string' ? JSON.parse(sections) : sections` to extract `sections.content`.

---

## 4. Backend Architecture

### Structure
```
src/
├── index.ts                    ← Express app entry point
├── lib/
│   ├── db.ts                   ← SQLite connection + query helper
│   ├── sse.ts                  ← SSEStream factory
│   └── auth.ts                 ← JWT middleware
├── services/
│   ├── auth/router.ts
│   ├── feedback/router.ts      ← upload, analyse-existing, pipeline
│   ├── insights/router.ts
│   ├── documents/router.ts     ← CRUD, versions, restore, AI assistant
│   ├── roadmap/router.ts
│   ├── sprint/router.ts
│   └── knowledge/router.ts
├── ai/
│   └── index.ts                ← All AI + keyword detection functions
└── db/
    ├── schema.sql              ← Table definitions
    ├── seed.ts                 ← Seed data (2 users, 1 product area); uses fixed deterministic UUIDs
    └── reset.ts                ← Drops and re-creates DB, then calls seed
```

### Route Structure

| Module | Base Path | Key Endpoints |
|---|---|---|
| Auth | `/api/auth` | `POST /login`, `GET /me` |
| Feedback | `/api/feedback` | `POST /upload`, `GET /items`, `POST /analyse-existing`, `POST /pipeline/commit` |
| Insights | `/api/insights` | `GET /themes`, `POST /ask`, `GET /pipeline-summary`, `POST /generate` |
| Documents | `/api/documents` | `GET /`, `POST /`, `PUT /:id`, `DELETE /:id`, `GET /:id/versions`, `POST /:id/restore/:versionId`, `POST /:id/ask` |
| Roadmap | `/api/roadmap` | `GET/POST /items`, `PATCH /items/:id` |
| Sprint | `/api/sprint` | `GET/POST /sprints`, `PATCH /sprints/:id`, `GET/POST /tickets`, `PATCH /tickets/:id`, `PATCH /tickets/:id/status`, `POST /sprints/:id/brief` |
| Knowledge | `/api/knowledge` | `GET/POST /entries`, `POST /ask` |

### Key Endpoint Details

**`POST /api/feedback/analyse-existing`**
Reads all `feedback_items` from the DB, runs `analyseFeedback()` (keyword-based), returns `{ themes, themeCounts, themeEvidence, feedbackCount, productAreaId, preview }`. Does not save anything — user approves via pipeline/commit.

**`GET /api/insights/pipeline-summary` and `POST /api/insights/generate`**
Both endpoints filter feedback and themes using `(product_area_id = $N OR product_area_id IS NULL)`. The `IS NULL` arm is required because the feedback pipeline creates all data without a product area assigned. Without this, reports return empty.

**`POST /api/feedback/pipeline/commit`** (SSE)
Receives themes from the client body, runs the full pipeline sequentially: stores themes → creates opportunities → generates PRD → User Stories → Acceptance Criteria → Roadmap items → Sprint → Sprint Tickets. Emits `progress` events per step and `done` at completion.

**`GET /api/documents/:id/versions`**
Returns all version snapshots for a document ordered by version DESC.

**`POST /api/documents/:id/restore/:versionId`**
Saves current content as a new version, then sets document content to the selected version's content.

**`PUT /api/documents/:id`**
Wrapped in `withTransaction`: saves current `sections` to `document_versions` before applying the update. Every save automatically creates a version entry.

### Authentication
All routes (except `/api/auth/login`) require `Authorization: Bearer <token>`. JWT payload: `userId`, `tenantId`. Every DB query scopes by `tenant_id` and optionally `product_area_id`.

---

## 5. Database Schema (SQLite)

### Multi-tenancy
Every table includes `tenant_id`. Product area scoping uses `product_area_id`.

### Core Tables

```sql
-- Identity
tenants (id, name, created_at)
users (id, tenant_id, email, password_hash, role, name, created_at)
product_areas (id, tenant_id, name, description, created_at)

-- Feedback
feedback_items (id, tenant_id, product_area_id, content, source, sentiment,
                sentiment_score, themes, created_at)

-- Themes / Insights
feedback_themes (id, tenant_id, product_area_id, name, item_count, created_at)

-- Documents + Version History
documents (
  id, tenant_id, product_area_id, created_by,
  title, type TEXT NOT NULL CHECK(type IN ('PRD','UserStory','AcceptanceCriteria','Reference')),
  status, sections, metadata, created_at, updated_at
)
document_versions (
  id, document_id, version INTEGER,
  sections, changed_by, created_at
)

-- Roadmap
roadmap_items (id, tenant_id, product_area_id, title, description, status,
               priority, feedback_cluster_id, created_at, updated_at)

-- Sprint
sprints (id, tenant_id, product_area_id, name, goal, start_date, end_date,
         status, created_at)
sprint_tickets (id, tenant_id, sprint_id, roadmap_item_id, title, description,
                type, status, story_points, acceptance_criteria, needs_grooming,
                grooming_notes, created_at, updated_at)

-- Knowledge Base
knowledge_entries (id, tenant_id, product_area_id, title, content, type, created_at)
```

### Key Relationships
```
Tenant → ProductArea → FeedbackItem → FeedbackTheme
                    → Document → DocumentVersion (auto-created on every PUT)
                    → RoadmapItem → SprintTicket
                    → Sprint → SprintTicket
                    → KnowledgeEntry
```

### SQLite Compatibility Notes
- Uses `IN (?, ?, ...)` placeholders — **not** PostgreSQL `ANY($1)` syntax
- CHECK constraints cannot be modified with ALTER TABLE; must drop and recreate table
- `sections` column stored as JSON text, parsed on the frontend

---

## 6. AI Orchestration

All AI functions live in `src/ai/index.ts`.

### Theme Detection — Keyword-Based (No LLM)

```typescript
const THEME_KEYWORDS: Record<string, string[]> = {
  'Onboarding friction':   ['onboarding', 'setup wizard', 'getting started', 'new user', ...],
  'Reporting & exports':   ['export', 'confluence', 'notion', 'pdf export', ...],
  'Performance issues':    ['performance', 'lag', 'latency', 'crashes', 'too slow', ...],
  'Integration requests':  ['integration', 'slack', 'jira', 'github', 'webhook', ...],
  'Mobile experience':     ['mobile', 'ios', 'android', 'phone', ...],
  'Dashboard UX':          ['dashboard', 'navigation menu', 'ui design', ...],
  'Permissions & access':  ['permission', 'invite teammate', 'access control', ...],
  'Sprint planning':       ['sprint planner', 'sprint brief', 'grooming', ...],
  'Billing & pricing':     ['billing', 'pricing', 'upgrade to paid', ...],
  'Notification settings': ['notification', 'email digest', 'alert settings', ...],
};

function pickThemes(text: string): ThemeMatch[] {
  // Returns only themes where a keyword is found in the text
  // Extracts the sentence containing the keyword as evidence
  // Never returns random fallback themes
}

function extractSnippet(text: string, keyword: string): string {
  // Splits on sentence boundaries, finds the sentence containing keyword
  // Truncates to 160 chars with ellipsis if needed
}
```

**ThemeMatch interface:** `{ name: string; snippet: string }`  
**FeedbackAnalysisResult:** `{ id, sentiment, sentimentScore, themes: ThemeMatch[] }`

### LLM-Powered Functions

| Function | Purpose | Streaming |
|---|---|---|
| `generateInsightSummary` | Evidence-backed summary for a theme | No |
| `answerInsightQuestion` | Answer PM's plain-language question | No |
| `generateRoadmapJustification` | Customer-evidence narrative for roadmap item | No |
| `generateSprintTickets` | Draft user story from roadmap item | No |
| `generateSprintBrief` | Complete sprint brief from real ticket data | Yes (SSE) |
| `generateDocumentContent` | Generate PRD/UserStory/AC from theme context | No |
| `answerDocumentQuestion` | Answer PM question using attached documents | Yes (SSE) |

---

## 7. Key Architectural Flows

### 7.1 Feedback → Pipeline

```
PM uploads feedback files
      ↓
POST /api/feedback/upload (stores feedback_items)
      ↓
PM clicks "Analyse Feedback"
      ↓
POST /api/feedback/analyse-existing
      ├─ Read feedback_items from DB
      ├─ analyseFeedback() → keyword matching per item
      ├─ Aggregate: themeCountMap, themeEvidenceMap
      └─ Return: { themes, themeCounts, themeEvidence, preview }
            ↓
PipelineApprovalModal shown with evidence per theme
            ↓
PM approves → POST /api/feedback/pipeline/commit (SSE)
      ├─ Store themes → feedback_themes
      ├─ Create opportunities
      ├─ Generate PRD (LLM) → documents
      ├─ Generate User Stories (LLM) → documents
      ├─ Generate Acceptance Criteria (LLM) → documents
      ├─ Create Roadmap items
      ├─ Create Sprint
      └─ Create Sprint Tickets
```

### 7.2 Roadmap Item → Planned → PRD Auto-Draft

```
PM changes roadmap item status to "planned" (status dropdown on card)
      ↓
PUT /api/roadmap/:id { status: 'planned' }
      ├─ Check: does a PRD draft already exist for this item?
      ├─ If not: INSERT into documents (type: PRD, title: 'PRD Draft: {item title}')
      └─ Return updated item + prdDraftId
            ↓
Frontend (RoadmapBoard.tsx):
  changeStatusMut.onSuccess → invalidate ['documents'] and ['roadmap-planned-check']
            ↓
DocumentWorkspace.tsx:
  roadmap-planned-check polls /api/roadmap?status=planned (tenant-wide, no area filter)
  prdAgentActive = planned.length > 0
  shouldPoll = agentRunning || prdAgentActive → refetchDocs every 3 s
  Banner: "Agent drafting PRD · please wait…" until PRD draft doc appears
  Banner switches to "PRD draft ready · review below" once doc with title starting "PRD Draft:" is found
```

### 7.3 Document Edit → Version Saved

```
PM opens document → clicks Edit
      ↓
textarea shown with current sections.content
PM edits content → clicks Save
      ↓
PUT /api/documents/:id { sections: { content: editContent } }
      ├─ withTransaction:
      │   ├─ INSERT into document_versions (current sections)
      │   └─ UPDATE documents SET sections = newSections
      └─ Return updated document
            ↓
Frontend: parse sections (string → object)
setSelectedDoc(updated) → setIsEditing(false)
Pre renders updated content
            ↓
History panel: GET /api/documents/:id/versions → shows v1, v2…
```

### 7.4 Sprint Brief (SSE)

```
PM clicks "Sprint Brief"
      ↓
POST /api/sprint/sprints/:id/brief
      ├─ Query sprint metadata + all sprint_tickets
      ├─ generateSprintBrief(sprint, tickets, stream.write)
      └─ stream.end()
            ↓
Frontend fetchSSEPost: onMessage appends chunks → StreamingText renders progressively
```

---

## 8. Non-Functional Architecture Decisions

### 8.1 Zero-Hallucination Theme Detection
Theme assignment uses deterministic keyword matching rather than an LLM prompt. This eliminates hallucination — no theme can appear unless its keywords are present in the actual feedback text. The evidence snippet is extracted directly from the matching sentence.

### 8.2 Sections Stored as JSON String
SQLite stores the `sections` field as a JSON text string. All backend reads return it as a string; the frontend always parses it before use:
```typescript
const parsed = typeof sections === 'string' ? JSON.parse(sections) : sections;
const content = parsed?.content ?? '';
```

### 8.3 Automatic Document Versioning
The `PUT /api/documents/:id` handler is wrapped in `withTransaction`. Before updating the row, it inserts the current `sections` into `document_versions` with an auto-incremented `version` number. No extra action is required from the PM.

### 8.4 StrictMode Safety
`fetchSSEPost` and all SSE consumers use a `cancelled` flag in `useEffect` cleanup to prevent React StrictMode's double-mount from duplicating streamed content.

### 8.5 Multi-tenant Isolation
Every SQL query filters by `tenant_id`. No cross-tenant data leakage is possible at the query layer.

### 8.6 Deterministic Seed UUIDs
`seed.ts` uses hard-coded fixed UUIDs for tenant, product area, admin, and PM. This ensures JWT tokens (which embed `tenantId`) remain valid after a full DB reset — the user does not need to log in again. If these IDs change, all existing browser sessions become silently empty (valid JWT, wrong tenant), not 401 — so changing them is a breaking operation.

### 8.7 Null Product-Area Scoping for Pipeline Data
All data created by the feedback pipeline (`feedback_themes`, `roadmap_items`, `documents`) has `product_area_id = NULL` because the pipeline operates at tenant level, not area level. Any SQL filter that uses an exact `product_area_id = $N` match will exclude all pipeline-created data. The correct pattern is `(product_area_id = $N OR product_area_id IS NULL)`. This is applied in:
- `GET /api/insights/pipeline-summary`
- `POST /api/insights/generate`
- `GET /api/documents` (documents endpoint)

### 8.8 SQLite vs. PostgreSQL
SQLite (`better-sqlite3`) is used — zero-config, fast for single-server. Migration to PostgreSQL when multi-server is needed: the `query()` helper abstracts the driver, but `ANY($1)` must remain as `IN (?,?,?)`.

---

## 9. Development Setup

| Service | Port | Command |
|---|---|---|
| Backend | 3000 | `cd PMAI/app/backend && npm run dev` |
| Frontend | 5173 | `cd PMAI/app/frontend && npm run dev` |

**Default credentials:** `pm@acme.example` / `PM12345!` (also `admin@acme.example` / `Admin12345!`)

**Seed data (seed.ts):** 2 users (Admin, PM), 1 product area (Core Platform). Uses **fixed deterministic UUIDs** so JWT tokens remain valid across DB resets — no re-login required after clearing data.

Fixed IDs:
- Tenant: `453d2f00-b151-41aa-b314-33edb7f8749c`
- Product Area: `728a9473-29a3-45e4-9f70-dcc3e605c30d`
- PM user: `f8fb6ebb-a82b-4340-b1ff-e1e936250df9`

**Environment variables (backend):**
```
ANTHROPIC_API_KEY=<key>
JWT_SECRET=<secret>
DATABASE_PATH=./data/pmai.db
PORT=3000
```

**Reset database:**
```
cd PMAI/app/backend && npx ts-node src/db/reset.ts
```
