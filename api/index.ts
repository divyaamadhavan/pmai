import 'dotenv/config';
import type { IncomingMessage, ServerResponse } from 'http';

const ready: Promise<void> = (async () => {
  const { getDb } = await import('../app/backend/src/db/index.js');
  getDb();
  const { connectRedis } = await import('../app/backend/src/cache/redis.js');
  await connectRedis();
  const { seed } = await import('../app/backend/src/db/seed.js');
  await seed();
})();

import app from '../app/backend/src/app.js';

export default async (req: IncomingMessage, res: ServerResponse) => {
  await ready;
  app(req, res);
};
