import 'dotenv/config';
import type { IncomingMessage, ServerResponse } from 'http';

const ready: Promise<void> = (async () => {
  const { getDb } = await import('../src/db/index.js');
  getDb();
  const { connectRedis } = await import('../src/cache/redis.js');
  await connectRedis();
  const { seed } = await import('../src/db/seed.js');
  await seed();
})();

import app from '../src/app.js';

export default async (req: IncomingMessage, res: ServerResponse) => {
  await ready;
  app(req, res);
};
