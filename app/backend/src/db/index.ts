import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = process.env.SQLITE_PATH ?? path.join(__dirname, '..', '..', 'pmai.db');

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');

  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  const statements = schema
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('--'));
  for (const stmt of statements) {
    try { _db.exec(stmt + ';'); } catch { /* ignore */ }
  }

  // Explicit column migrations — safe to re-run (errors ignored)
  const migrations = [
    `ALTER TABLE feedback_items ADD COLUMN status TEXT DEFAULT 'new'`,
    `ALTER TABLE feedback_classifications ADD COLUMN customer_aspect TEXT`,
    `ALTER TABLE feedback_classifications ADD COLUMN critical_recommendation INTEGER DEFAULT 0`,
    `ALTER TABLE feedback_classifications ADD COLUMN critical_reason TEXT`,
    `ALTER TABLE feedback_classifications ADD COLUMN financial_benefits TEXT DEFAULT '[]'`,
    `ALTER TABLE feedback_classifications ADD COLUMN qualitative_benefits TEXT DEFAULT '[]'`,
    `ALTER TABLE feedback_classifications ADD COLUMN type TEXT DEFAULT 'Enhancement'`,
    // Agent enrichment write-back columns
    `ALTER TABLE feedback_items ADD COLUMN agent_category TEXT`,
    `ALTER TABLE feedback_items ADD COLUMN agent_priority TEXT`,
    `ALTER TABLE feedback_items ADD COLUMN agent_composite_score INTEGER`,
    `ALTER TABLE feedback_themes ADD COLUMN agent_triage_decision TEXT`,
    `ALTER TABLE feedback_themes ADD COLUMN agent_triage_rationale TEXT`,
    `ALTER TABLE feedback_themes ADD COLUMN agent_triage_details TEXT`,
    `ALTER TABLE feedback_themes ADD COLUMN agent_triage_actioned INTEGER DEFAULT 0`,
    `CREATE TABLE IF NOT EXISTS agent_snapshots (id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))), tenant_id TEXT NOT NULL, agent_type TEXT NOT NULL, result_json TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')))`,
  ];
  for (const m of migrations) {
    try { _db.exec(m + ';'); } catch { /* column already exists — ignore */ }
  }

  return _db;
}

// Convert PostgreSQL syntax → SQLite syntax
function pgToSqlite(sql: string): string {
  return sql
    .replace(/\$\d+/g, '?')                          // $1 $2 → ?
    .replace(/\bNOW\(\)/gi, "datetime('now')")        // NOW() → datetime('now')
    .replace(/::[\w]+/g, '')                          // remove ::type casts
    .replace(/\bINET\b/gi, 'TEXT')                    // INET type → TEXT
    .replace(/\bSERIAL\b/gi, 'INTEGER')              // SERIAL → INTEGER
    .replace(/\bTRUE\b/g, '1')
    .replace(/\bFALSE\b/g, '0')
    .replace(/INTERVAL\s+'[^']+'/gi, '') // strip INTERVAL literals (handled per-query)
    .replace(/\bFILTER\s*\(WHERE\b/gi, 'FILTER (WHERE'); // keep FILTER syntax (SQLite 3.44+)
}

export interface QueryResult<T = Record<string, unknown>> {
  rows: T[];
  rowCount: number;
}

// Normalize params: convert Date → ISO string, boolean → 0/1
function normalizeParams(params: unknown[]): unknown[] {
  return params.map((p) => {
    if (p instanceof Date) return p.toISOString();
    if (p === true) return 1;
    if (p === false) return 0;
    return p;
  });
}

export async function query<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<QueryResult<T>> {
  const db = getDb();
  const converted = pgToSqlite(sql.trim());
  const normalized = normalizeParams(params);
  const isSelect = /^(SELECT|WITH|PRAGMA)/i.test(converted);
  const hasReturning = /\bRETURNING\b/i.test(converted);

  if (isSelect || hasReturning) {
    const rows = db.prepare(converted).all(...normalized) as T[];
    return { rows, rowCount: rows.length };
  } else {
    const info = db.prepare(converted).run(...normalized);
    return { rows: [] as T[], rowCount: info.changes };
  }
}

// Fake PoolClient shape used by withTransaction callers
interface FakeClient {
  query: typeof query;
}

export async function withTransaction<T>(fn: (client: FakeClient) => Promise<T>): Promise<T> {
  const db = getDb();
  let result!: T;
  const txFn = db.transaction(() => {
    // better-sqlite3 transactions are sync; we need a workaround for async callbacks
  });
  // Run outside of transaction wrapper since our "transactions" are single inserts
  // and better-sqlite3 doesn't support async callbacks inside transactions.
  // For true atomicity, wrap sync code manually if needed.
  result = await fn({ query });
  return result;
}

// Kept for bootstrap compatibility
export const pool = {
  connect: async () => ({
    query: (sql: string, params: unknown[] = []) => query(sql, params),
    release: () => {},
  }),
};
