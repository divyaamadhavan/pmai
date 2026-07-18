/**
 * DB Seed Script (SQLite)
 * Creates demo tenant, admin user, PM user, and product area.
 * Safe to call multiple times — skips if already seeded.
 * Usage: npm run seed  OR  imported by bootstrap
 */

import { getDb } from "./index.js";

// Pre-computed bcrypt hashes (rounds=10) — avoids slow hash on serverless cold start
const ADMIN_HASH = "$2a$10$ATcbdDcPYOHVr40ZLn8/GOrifn8ODoyllug/AwJtCYciYQxA1keGO";
const PM_HASH    = "$2a$10$zmLSqihOJNGn7sLISHtRnOB7WQ0G4HG7wPAw/jFurqRnVeJGVtR5a";

// Fixed IDs so tokens remain valid across DB resets — changing these would invalidate all existing JWTs
const TENANT_ID = '453d2f00-b151-41aa-b314-33edb7f8749c';
const AREA_ID   = '728a9473-29a3-45e4-9f70-dcc3e605c30d';
const ADMIN_ID  = 'a1b2c3d4-0000-4000-8000-000000000001';
const PM_ID     = 'f8fb6ebb-a82b-4340-b1ff-e1e936250df9';

export async function seed() {
  const db = getDb();

  const existing = db.prepare("SELECT id FROM tenants WHERE slug = 'acme' LIMIT 1").get();
  if (existing) {
    console.log("[seed] Already seeded. Skipping.");
    return;
  }

  console.log("[seed] Seeding demo data…");

  const tenantId = TENANT_ID;
  const areaId   = AREA_ID;
  const adminId  = ADMIN_ID;
  const pmId     = PM_ID;

  db.prepare("INSERT INTO tenants (id, name, slug, settings) VALUES (?, ?, ?, ?)")
    .run(tenantId, "Acme Corp", "acme", "{}");

  db.prepare("INSERT INTO product_areas (id, tenant_id, name, description) VALUES (?, ?, ?, ?)")
    .run(areaId, tenantId, "Core Platform", "Main product area");

  db.prepare("INSERT INTO users (id, tenant_id, product_area_id, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(adminId, tenantId, areaId, "admin@acme.example", ADMIN_HASH, "Admin User", "Admin");

  db.prepare("INSERT INTO users (id, tenant_id, product_area_id, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(pmId, tenantId, areaId, "pm@acme.example", PM_HASH, "Product Manager", "PM");

  console.log("[seed] Done — pm@acme.example / PM12345!");
}

// Allow running directly: tsx src/db/seed.ts
if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  import('dotenv/config').then(() => seed()).then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}

export default seed;
