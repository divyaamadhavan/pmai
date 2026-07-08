# PMAI — Screen Design Specification

## Document Info

| Field | Detail |
|---|---|
| Version | 3.0 |
| Status | Final |
| Date | 2026-07-08 |
| Source | Built application |

---

## Core Flow

All screens map to the end-to-end PM journey:

```
Feedback Hub → Insights → Documents → Roadmap → Sprint Planner → Sprint Brief
```

Supporting screens: Dashboard (Overview), Knowledge Base, Settings

---

## 1. Global Design System

### Layout Shell
```
┌─────────────────────────────────────────────────────────┐
│  PMAI Logo   [Product Area Switcher ▾]        [Avatar]  │  ← Top Nav
├──────────┬──────────────────────────────────────────────┤
│          │                                              │
│  Sidebar │            Main Content Area                 │
│          │            (dark bg: #020212)                │
│          │                                              │
└──────────┴──────────────────────────────────────────────┘
```

### Sidebar Navigation
| Label | Route | Description |
|---|---|---|
| Overview | `/` | Status overview of PM's pipeline |
| Feedback Hub | `/feedback` | Upload + cluster customer feedback |
| Insights | `/insights` | AI-generated theme summaries + Q&A |
| Documents | `/documents` | PRDs, specs, inline editing, version history |
| Roadmap | `/roadmap` | Evidence-backed roadmap board |
| Sprint Planner | `/sprint` | Multi-sprint management + grooming |
| Knowledge Base | `/knowledge` | Documents + contextual AI search |
| Settings | `/settings` | Profile, AI preferences |

### Neon Dark Theme Tokens
| Token | Hex | Usage |
|---|---|---|
| `neon-cyan` | `#00d4ff` | Primary actions, active states, AI content |
| `neon-purple` | `#a855f7` | Sprint features, secondary actions |
| `neon-green` | `#00ff88` | Success, done states, Save button |
| `neon-pink` | `#ff2d8b` | Sprint brief, AI generation, Reference docs |
| `neon-yellow` | `#ffee00` | Edit button, grooming flags, warnings |
| `text-primary` | `#e2e8f0` | Body text |
| `bg-primary` | `#020212` | Page background |
| `bg-card` | `rgba(10,10,36,0.9)` | Card backgrounds |

### AI Content Badge
Every AI-generated section carries: `✦ AI-assisted · model · date`

---

## 2. Authentication

### Login Screen
```
┌────────────────────────────────┐
│           PMAI                 │
│    AI Assistant for PMs        │
│                                │
│  Email                         │
│  [________________________]    │
│                                │
│  Password                      │
│  [________________________]    │
│                                │
│  [       Sign In →         ]   │
└────────────────────────────────┘
```

**Default credentials:** `pm@acme.example` / `PM12345!`

---

## 3. Dashboard (Overview)

**Purpose:** Single-glance status of the PM's pipeline.

```
Good afternoon, [Name] · Core Platform

┌──────────┬──────────┬──────────┬──────────┬──────────┐
│ Feedback │ Insights │  Docs    │ Roadmap  │  Sprint  │
│  2 items │ 5 themes │  4 docs  │ 3 items  │  Active  │
└──────────┴──────────┴──────────┴──────────┴──────────┘

┌──────────────────────────────┐  ┌─────────────────────┐
│  TOP THEMES                  │  │  SENTIMENT          │
│  · Onboarding friction (1)   │  │  1 Positive         │
│  · Permissions & access (1)  │  │  0 Neutral          │
│  · Reporting & exports (1)   │  │  1 Negative         │
└──────────────────────────────┘  └─────────────────────┘
```

Pipeline step cards link to each respective module. Numbers show live counts from the database.

---

## 4. Feedback Hub

### 4.1 Feedback List

```
◆ FEEDBACK HUB

┌────────────────────────────────────────────────┐
│  Sarah Mitchell — 4 Jul 2026                   │
│  "I want to give some feedback about the       │
│   onboarding experience…"  [Negative]          │
└────────────────────────────────────────────────┘
┌────────────────────────────────────────────────┐
│  James Okafor — 3 Jul 2026                     │
│  "Just wanted to say the Sprint Planner…"      │
│  [Positive]                                    │
└────────────────────────────────────────────────┘

[ ⚡ Analyse Feedback ]    ← always visible when feedback exists
```

**Note:** "Sync Feedback" has been removed — it was a no-op stub. "Analyse Feedback" is always visible when feedback exists, even after prior analyses.

### 4.2 Upload Feedback
```
[ Upload Feedback ]  ← drag-and-drop or file picker
Accepts: .txt, .md, .pdf, .docx, .eml, .csv
```

### 4.3 Pipeline Approval Modal (after Analyse)

```
┌─────────────────────────────────────────────────────┐
│  ✦  Review AI Plan                                  │
│  2 feedback item(s) · 3 theme(s) detected           │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │ Onboarding friction                  ×1     │   │
│  │ "The setup wizard is confusing and I        │   │
│  │  couldn't figure out how to invite…"        │   │
│  └─────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────┐   │
│  │ Permissions & access                 ×1     │   │
│  │ "Inviting teammates is buried and           │   │
│  │  permissions are hard to understand."       │   │
│  └─────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────┐   │
│  │ Reporting & exports                  ×1     │   │
│  │ "We can't export to Confluence or Notion    │   │
│  │  without copy-pasting everything."          │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  PRD Title                                          │
│  [ Product Requirements — Onboarding friction… ]   │
│                                                     │
│  Sprint Name                                        │
│  [ Sprint 1 — Core Platform ]                       │
│                                                     │
│  ▼ PRD + User Stories + AC  (3)                    │
│  ▼ Roadmap Items            (2)                    │
│  ▼ Sprint Tickets           (4)                    │
│                                                     │
│  [ Cancel ]    [ ✦ Approve & Create All ]           │
└─────────────────────────────────────────────────────┘
```

Each theme card shows the exact sentence from the feedback that triggered it (verbatim evidence, italicised in cyan).

### 4.4 Pipeline Running State (SSE)

```
Running pipeline…

✓  Storing themes
✓  Creating opportunities
⟳  Generating PRD                ← spinning while active
○  Generating User Stories
○  Generating Acceptance Criteria
○  Creating Roadmap items
○  Creating Sprint & tickets
```

Steps turn green (✓) as they complete.

---

## 5. Insights

### 5.1 Insights List

```
◆ INSIGHTS

┌──────────────────────────────────────────────────────────┐
│  Onboarding friction                          ×1   ✦ AI  │
│  "The setup wizard is confusing…"                        │
│  [ View Detail ]   [ Generate PRD → ]                    │
└──────────────────────────────────────────────────────────┘
```

### 5.2 Ask AI Input

PM types a plain-language question; AI answers with evidence citations.

---

## 6. Documents Workspace

**Purpose:** View, create, edit, and version AI-generated and uploaded documents. An AI assistant panel helps PMs update documents using attached references.

### 6.1 Layout

```
◆ DOCUMENTS / Workspace

┌─────────────────────┬──────────────────────────────────────────────────┐
│  DOCUMENT LIST      │  DOCUMENT VIEWER / EDITOR                        │
│                     │                                                  │
│  ┌───────────────┐  │  PRD  ·  Onboarding friction   Draft            │
│  │ PRD           │  │  [ Edit ] [ Attach to AI ] [ History ] [ ✕ ]    │
│  │ Onboarding    │  │                                                  │
│  │ friction      │  │  # PRD — Onboarding friction                     │
│  │ Draft 7/8     │  │                                                  │
│  └───────────────┘  │  ## Problem Statement                            │
│  ┌───────────────┐  │  Customer feedback identified 2 items about      │
│  │ Acc           │  │  "Onboarding friction". Themes: setup wizard…    │
│  │ Acceptance    │  │                                                  │
│  │ Criteria…     │  │  ## Goals                                        │
│  └───────────────┘  │  1. Reduce onboarding time from 3 days to…      │
│  ┌───────────────┐  │                                                  │
│  │ Use           │  │                                                  │
│  │ User Stories  │  ├──────────────────────────────────────────────────┤
│  └───────────────┘  │  AI ASSISTANT                                    │
│                     │                                                  │
├─────────────────────┤  Bot: I can help update this PRD or answer       │
│  GENERATE FROM      │  questions about it.                             │
│  FEEDBACK           │                                                  │
│                     │  [Ask the AI assistant…       ] [📎] [Send →]   │
│  1· SELECT THEME    │                                                  │
│  · Onboarding…      │  Suggested: "Summarise this document"            │
│  · Permissions…     │             "Add acceptance criteria"            │
│  · Reporting…       │             "Update PRD with latest changes"     │
│                     │                                                  │
│  2· CHOOSE TYPE     │                                                  │
│  [ PRD ]            │                                                  │
│  [ User Story ]     │                                                  │
│  [ Acceptance Crit] │                                                  │
│                     │                                                  │
│  [ Generate → ]     │                                                  │
└─────────────────────┴──────────────────────────────────────────────────┘
```

### 6.2 Inline Document Editing

```
PRD  ·  Onboarding friction   Draft
[ Save ✓ ] [ Cancel ✕ ] [ Attach to AI ] [ History ] [ ✕ ]
↑ Save (green) and Cancel appear when editing

┌────────────────────────────────────────────────────┐
│ # PRD — Onboarding friction                        │  ← editable textarea
│                                                    │    yellow border
│ ## Problem Statement                               │    monospace font
│ Customer feedback identified 2 items…              │
│                                                    │
│ <!-- PM Edit Test -->                              │
│                                                    │
│                                                    │
└────────────────────────────────────────────────────┘
```

**Edit button:** yellow, `✏ Edit`
**Save button:** green, `💾 Save` (disabled with spinner while saving)
**Cancel button:** reverts to read view, no save

### 6.3 Version History Panel (side panel)

```
PRD  ·  Onboarding friction
[ Edit ] [ Attach to AI ] [ History ▣ ] [ ✕ ]
                                        ↑ active

┌──────────────────────────────────────────┐
│  VERSION HISTORY                         │
│                                          │
│  v3  · 7/8/2026  · PM          [Restore] │
│  v2  · 7/8/2026  · PM          [Restore] │
│  v1  · 7/8/2026  · PM          [Restore] │
└──────────────────────────────────────────┘
```

Clicking **Restore** saves the current version first, then replaces content with the selected version.

### 6.4 Document Upload in AI Assistant

The 📎 button in the AI assistant input bar opens a file picker. Uploaded files are:
- Saved as Reference documents in the library
- Automatically attached to the AI conversation (shown as chips above the input)
- Used as context by the AI when answering questions

```
┌──────────────────────────────────────────────────────┐
│  📎 competitive-analysis.pdf  ✕                      │  ← attached doc chip
│  [Ask the AI assistant about this document…] [📎][→] │
└──────────────────────────────────────────────────────┘
```

---

## 7. Roadmap

```
◆ ROADMAP

┌──────────────┬──────────────┬────────────────┬──────────┐
│  BACKLOG     │  PLANNED     │  IN PROGRESS   │  DONE    │
│ ┌──────────┐ │ ┌──────────┐ │                │          │
│ │Onboarding│ │ │Reporting │ │                │          │
│ │friction  │ │ │& exports │ │                │          │
│ │ 1 item   │ │ │          │ │                │          │
│ │[ →Sprint]│ │ │[ →Sprint]│ │                │          │
│ └──────────┘ │ └──────────┘ │                │          │
└──────────────┴──────────────┴────────────────┴──────────┘
```

---

## 8. Sprint Planner

### 8.1 Sprint View Header

```
◆ SPRINT PLANNER                    [New Sprint]  [Sprint Brief]

[ Sprint 1 — Core Platform ✏ ]   ← hover to rename
```

### 8.2 Sprint Stats

```
┌──────────────┬──────────────┬──────────────┬──────────────┐
│ TOTAL POINTS │  COMPLETED   │ TOTAL TICKETS│ NEEDS GROOM  │
│     34       │      8       │      7       │      2       │
└──────────────┴──────────────┴──────────────┴──────────────┘

Sprint Progress ─────────────── 24%
Goal: Resolve top customer-reported issues
```

### 8.3 Ticket Row

```
┌─────────────────────────────────────────────────────────────┐
│ ⚠  [STORY] Address: Onboarding friction                     │
│    5 pts  [ To Do ▾ ]  [ 🚩 Groom ]  [ ✏ Edit ]  [ ↔ Move ]│
└─────────────────────────────────────────────────────────────┘
```

---

## 9. Sprint Brief Modal

```
┌────────────────────────────────────────────────────────┐
│  Sprint Brief — Sprint 1 — Core Platform          [✕]  │
│  ─────────────────────────────────────────────────     │
│                                                        │
│  ## Sprint Brief — Sprint 1 — Core Platform            │
│  **Period:** 2026-07-08 → 2026-07-22                   │
│  **Goal:** Resolve top customer-reported issues         │
│                                                        │
│  ### Scope                                             │
│  7 user stories · 34 story points committed            │
│                                                        │
│  ### User Stories                                      │
│  1. **[STORY] Address: Onboarding friction** [todo, 5] │
│     …                                                  │
│                                                        │
│  *Generated by PMAI · 8 Jul 2026*  ▌ (streaming)      │
└────────────────────────────────────────────────────────┘
```

---

## 10. Knowledge Base

```
Knowledge Base · Core Platform

┌───────────────────────────────────────────────────────┐
│  🔍  Ask anything about this product…        [ Ask ]  │
└───────────────────────────────────────────────────────┘

Recent Documents
· Search v2 PRD  · Competitor Analysis

[ + Upload Document ]
```

---

## 11. Navigation & Information Architecture

### Cross-Screen Links
| From | To | Trigger |
|---|---|---|
| Feedback Hub (approved) | Documents | Pipeline creates PRD automatically |
| Feedback theme | Roadmap | Pipeline creates roadmap item |
| Roadmap item | Sprint Planner | "→ Sprint" button |
| Sprint Planner | Sprint Brief | "Sprint Brief" button |
| Dashboard stat | Respective module | Click card |
| Documents AI | Reference Upload | 📎 button in chat input |

---

## 12. Error & Empty States

### Empty States
| Screen | Message | CTA |
|---|---|---|
| Feedback Hub | "No feedback yet." | Upload Feedback |
| Documents | "Select an existing document or generate from feedback" | — |
| Documents (no doc selected) | AI panel: "Pick a theme → Generate doc, or open an existing one" | — |
| Roadmap | "Your roadmap is empty." | + Add Item |
| Sprint Planner | "No sprints yet." | New Sprint |

### Loading States
| Context | Pattern |
|---|---|
| AI generation (SSE) | Streaming text with blinking cursor |
| Document save | Save button shows spinner; disabled |
| Pipeline steps | Step-by-step progress with ✓ / ⟳ / ○ indicators |
| Initial page load | Skeleton screens matching layout |
