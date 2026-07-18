/**
 * Reset script — wipes all product data, keeps auth intact.
 * Inserts 2 realistic test feedback emails.
 * Usage: npx tsx src/db/reset.ts
 */

import 'dotenv/config';
import { getDb } from './index.js';

function run() {
  const db = getDb();

  // ── 1. Wipe all product data (preserve tenants / product_areas / users) ──────
  const tables = [
    'sprint_briefs',
    'sprint_tickets',
    'sprints',
    'roadmap_items',
    'opportunities',
    'document_versions',
    'documents',
    'feedback_classifications',
    'feedback_clusters',
    'feedback_themes',
    'feedback_items',
    'knowledge_entries',
    'audit_log',
    'refresh_tokens',
  ];

  for (const t of tables) {
    db.prepare(`DELETE FROM ${t}`).run();
    console.log(`[reset] Cleared: ${t}`);
  }

  console.log('\n[reset] Done. Database cleared — ready for fresh feedback.');
  console.log('  Login: pm@acme.example / PM12345!');
  process.exit(0);
}

run();
