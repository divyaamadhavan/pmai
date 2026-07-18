-- SQLite schema for PMAI
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS tenants (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  slug        TEXT UNIQUE NOT NULL,
  settings    TEXT NOT NULL DEFAULT '{}',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS product_areas (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_area_id TEXT REFERENCES product_areas(id) ON DELETE SET NULL,
  email           TEXT NOT NULL,
  password_hash   TEXT NOT NULL,
  full_name       TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'PM' CHECK(role IN ('PM','Product Leader','Scrum Master','Admin')),
  is_active       INTEGER NOT NULL DEFAULT 1,
  last_login_at   TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(tenant_id, email)
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TEXT NOT NULL,
  revoked     INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS feedback_items (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_area_id TEXT REFERENCES product_areas(id) ON DELETE SET NULL,
  external_id     TEXT,
  channel         TEXT NOT NULL DEFAULT 'Manual' CHECK(channel IN ('Intercom','Zendesk','Slack','CSV','Manual','Email')),
  source_url      TEXT,
  author          TEXT,
  body            TEXT NOT NULL,
  sentiment       TEXT CHECK(sentiment IN ('positive','neutral','negative')),
  sentiment_score REAL,
  is_noise        INTEGER NOT NULL DEFAULT 0,
  flagged_at      TEXT,
  flagged_by      TEXT REFERENCES users(id),
  received_at     TEXT NOT NULL DEFAULT (datetime('now')),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(tenant_id, channel, external_id)
);

CREATE TABLE IF NOT EXISTS feedback_themes (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_area_id TEXT REFERENCES product_areas(id) ON DELETE SET NULL,
  name            TEXT NOT NULL,
  description     TEXT,
  item_count      INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS feedback_clusters (
  id               TEXT PRIMARY KEY,
  tenant_id        TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_area_id  TEXT REFERENCES product_areas(id) ON DELETE SET NULL,
  theme_id         TEXT REFERENCES feedback_themes(id) ON DELETE SET NULL,
  feedback_item_id TEXT NOT NULL REFERENCES feedback_items(id) ON DELETE CASCADE,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS documents (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_area_id TEXT REFERENCES product_areas(id) ON DELETE SET NULL,
  created_by      TEXT NOT NULL REFERENCES users(id),
  title           TEXT NOT NULL,
  type            TEXT NOT NULL CHECK(type IN ('PRD','UserStory','AcceptanceCriteria','Reference')),
  status          TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','in_review','approved','archived')),
  sections        TEXT NOT NULL DEFAULT '{}',
  metadata        TEXT NOT NULL DEFAULT '{}',
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS document_versions (
  id          TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  tenant_id   TEXT NOT NULL,
  version     INTEGER NOT NULL,
  sections    TEXT NOT NULL DEFAULT '{}',
  changed_by  TEXT NOT NULL REFERENCES users(id),
  change_note TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS opportunities (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_area_id TEXT REFERENCES product_areas(id) ON DELETE SET NULL,
  title           TEXT NOT NULL,
  description     TEXT,
  evidence        TEXT NOT NULL DEFAULT '[]',
  impact_score    REAL,
  effort_score    REAL,
  priority_score  REAL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS roadmap_items (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_area_id TEXT REFERENCES product_areas(id) ON DELETE SET NULL,
  opportunity_id  TEXT REFERENCES opportunities(id) ON DELETE SET NULL,
  title           TEXT NOT NULL,
  description     TEXT,
  status          TEXT NOT NULL DEFAULT 'backlog' CHECK(status IN ('backlog','planned','in_progress','done','cancelled')),
  priority_score  REAL,
  justification   TEXT,
  target_quarter  TEXT,
  created_by      TEXT NOT NULL REFERENCES users(id),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sprints (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_area_id TEXT REFERENCES product_areas(id) ON DELETE SET NULL,
  name            TEXT NOT NULL,
  goal            TEXT,
  start_date      TEXT,
  end_date        TEXT,
  brief           TEXT,
  brief_generated_at TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sprint_tickets (
  id                  TEXT PRIMARY KEY,
  tenant_id           TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_area_id     TEXT REFERENCES product_areas(id) ON DELETE SET NULL,
  sprint_id           TEXT REFERENCES sprints(id) ON DELETE SET NULL,
  roadmap_item_id     TEXT REFERENCES roadmap_items(id) ON DELETE SET NULL,
  title               TEXT NOT NULL,
  description         TEXT,
  type                TEXT NOT NULL DEFAULT 'story' CHECK(type IN ('story','task','bug','spike')),
  status              TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo','in_progress','in_review','done')),
  story_points        INTEGER,
  acceptance_criteria TEXT NOT NULL DEFAULT '[]',
  needs_grooming      INTEGER NOT NULL DEFAULT 0,
  grooming_notes      TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sprint_briefs (
  id         TEXT PRIMARY KEY,
  sprint_id  TEXT NOT NULL REFERENCES sprints(id) ON DELETE CASCADE,
  tenant_id  TEXT NOT NULL,
  content    TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS knowledge_entries (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_area_id TEXT REFERENCES product_areas(id) ON DELETE SET NULL,
  title           TEXT NOT NULL,
  content         TEXT NOT NULL,
  entry_type      TEXT NOT NULL DEFAULT 'document' CHECK(entry_type IN ('document','feedback_summary','onboarding','custom')),
  source_id       TEXT,
  source_type     TEXT,
  metadata        TEXT NOT NULL DEFAULT '{}',
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS feedback_classifications (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_area_id TEXT REFERENCES product_areas(id) ON DELETE SET NULL,
  theme_name      TEXT NOT NULL,
  category        TEXT NOT NULL,
  priority        TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('critical','high','medium','low')),
  priority_rationale TEXT,
  benefits        TEXT NOT NULL DEFAULT '[]',
  tradeoffs       TEXT NOT NULL DEFAULT '[]',
  affected_users  TEXT,
  revenue_impact  TEXT,
  pm_decision     TEXT DEFAULT 'pending' CHECK(pm_decision IN ('book_of_work','backlog','dismissed','pending')),
  pm_decision_at  TEXT,
  roadmap_item_id TEXT REFERENCES roadmap_items(id) ON DELETE SET NULL,
  feedback_count  INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

ALTER TABLE feedback_items ADD COLUMN status TEXT DEFAULT 'new';
ALTER TABLE feedback_classifications ADD COLUMN customer_aspect TEXT;
ALTER TABLE feedback_classifications ADD COLUMN critical_recommendation INTEGER DEFAULT 0;
ALTER TABLE feedback_classifications ADD COLUMN critical_reason TEXT;
ALTER TABLE feedback_classifications ADD COLUMN financial_benefits TEXT DEFAULT '[]';
ALTER TABLE feedback_classifications ADD COLUMN qualitative_benefits TEXT DEFAULT '[]';

CREATE TABLE IF NOT EXISTS audit_log (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL,
  product_area_id TEXT,
  user_id         TEXT REFERENCES users(id) ON DELETE SET NULL,
  action          TEXT NOT NULL,
  resource_type   TEXT,
  resource_id     TEXT,
  metadata        TEXT NOT NULL DEFAULT '{}',
  ip_address      TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
