import 'dotenv/config';
import type { IncomingMessage, ServerResponse } from 'http';

let initError: unknown = null;

const ready: Promise<void> = (async () => {
  const { getDb } = await import('../src/db/index.js');
  getDb();
  console.log('[init] DB ready');
  const { connectRedis } = await import('../src/cache/redis.js');
  await connectRedis();
  console.log('[init] Cache ready');
  const { seed } = await import('../src/db/seed.js');
  await seed();
  console.log('[init] Seed done');
})().catch((err) => {
  initError = err;
  console.error('[init] FAILED:', err);
});

import app from '../src/app.js';

export default async (req: IncomingMessage, res: ServerResponse) => {
  await ready;
  if (initError) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ data: null, error: { message: String(initError), code: 'INIT_FAILED' } }));
    return;
  }
  app(req, res);
};
