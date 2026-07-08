/**
 * DB Seed Script (SQLite)
 * Creates demo tenant, admin user, PM user, and product area.
 * Safe to call multiple times — skips if already seeded.
 * Usage: npm run seed  OR  imported by bootstrap
 */

import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "./index.js";

export async function seed() {
  const db = getDb();

  const existing = db.prepare("SELECT id FROM tenants WHERE slug = 'acme' LIMIT 1").get();
  if (existing) {
    console.log("[seed] Already seeded. Skipping.");
    return;
  }

  console.log("[seed] Seeding demo data…");

  const tenantId = uuidv4();
  const areaId = uuidv4();
  const adminId = uuidv4();
  const pmId = uuidv4();

  db.prepare("INSERT INTO tenants (id, name, slug, settings) VALUES (?, ?, ?, ?)")
    .run(tenantId, "Acme Corp", "acme", "{}");

  db.prepare("INSERT INTO product_areas (id, tenant_id, name, description) VALUES (?, ?, ?, ?)")
    .run(areaId, tenantId, "Core Platform", "Main product area");

  const adminHash = await bcrypt.hash("Admin12345!", 12);
  db.prepare("INSERT INTO users (id, tenant_id, product_area_id, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(adminId, tenantId, areaId, "admin@acme.example", adminHash, "Admin User", "Admin");

  const pmHash = await bcrypt.hash("PM12345!", 12);
  db.prepare("INSERT INTO users (id, tenant_id, product_area_id, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(pmId, tenantId, areaId, "pm@acme.example", pmHash, "Product Manager", "PM");

  console.log("[seed] Done — pm@acme.example / PM12345!");
}

// Allow running directly: tsx src/db/seed.ts
if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  import('dotenv/config').then(() => seed()).then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}

export default seed;
