/**
 * Reset script — wipes all product data, keeps auth intact.
 * Inserts 2 realistic test feedback emails.
 * Usage: npx tsx src/db/reset.ts
 */

import 'dotenv/config';
import { v4 as uuidv4 } from 'uuid';
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

  // ── 2. Get tenant + area + PM user IDs ────────────────────────────────────────
  const tenant = db.prepare(`SELECT id FROM tenants WHERE slug = 'acme' LIMIT 1`).get() as { id: string } | undefined;
  if (!tenant) { console.error('[reset] No tenant found — run npm run seed first'); process.exit(1); }

  const area = db.prepare(`SELECT id FROM product_areas WHERE tenant_id = ? LIMIT 1`).get(tenant.id) as { id: string } | undefined;
  if (!area) { console.error('[reset] No product area found'); process.exit(1); }

  // ── 3. Insert 2 realistic feedback emails ─────────────────────────────────────

  const email1 = {
    id: uuidv4(),
    body: `Subject: Onboarding experience is way too complicated

Hi Support Team,

I signed up for Core Platform last week and I have to say the onboarding experience has been really frustrating. It took me nearly two hours to get my first project set up, and I still had to watch three YouTube tutorials just to understand how the workspace permissions work.

The main issues I ran into:
1. The initial setup wizard doesn't explain what "product areas" are before asking me to create one. I had no idea what to enter.
2. Inviting teammates requires going through three different settings screens. This should be a single step.
3. There's no sample data or demo mode, so the empty state is very confusing for new users.

I work at a 50-person SaaS company and we evaluated four PM tools before choosing this one. The feature set is excellent but if onboarding doesn't improve, we'll lose adoption internally. Our team lead has already complained twice this week.

Please consider a guided setup flow or at minimum clearer tooltips at each step.

Thanks,
Sarah Mitchell
Head of Product, Finova Labs`,
    author: 'Sarah Mitchell <sarah.mitchell@finovalabs.com>',
    sentiment: 'negative' as const,
    sentiment_score: 0.85,
  };

  const email2 = {
    id: uuidv4(),
    body: `Subject: Love the Sprint Planner — one big request though

Hey PMAI team,

Just wanted to send a quick note to say the Sprint Planner feature is genuinely excellent. We've been using it for our last three sprints and the automated grooming flags have saved our team probably 2 hours of prep time per sprint. The sprint brief generation is also a huge win — our engineering lead now looks forward to planning meetings because everything is prepared in advance.

One thing that's really slowing us down: we can't export the sprint brief or roadmap to Confluence or Notion. Right now I have to manually copy-paste the generated brief into our Confluence space, which takes 15–20 minutes and introduces formatting issues.

We'd love a one-click export to Confluence (we're on Cloud). Even a PDF export would help. I know three other teams in our org who would immediately upgrade to the paid plan if this existed.

Is this on the roadmap? Happy to join a beta if that's an option.

Best,
James Okafor
Senior PM, Meridian Health Tech`,
    author: 'James Okafor <james.okafor@meridianhealth.io>',
    sentiment: 'positive' as const,
    sentiment_score: 0.72,
  };

  for (const email of [email1, email2]) {
    db.prepare(`
      INSERT INTO feedback_items
        (id, tenant_id, product_area_id, channel, author, body, sentiment, sentiment_score, received_at)
      VALUES (?, ?, ?, 'Email', ?, ?, ?, ?, datetime('now'))
    `).run(email.id, tenant.id, area.id, email.author, email.body, email.sentiment, email.sentiment_score);
    console.log(`[reset] Inserted feedback email from: ${email.author.split('<')[0].trim()}`);
  }

  console.log('\n[reset] Done. Database reset with 2 feedback emails.');
  console.log('  Login: pm@acme.example / PM12345!');
  process.exit(0);
}

run();
