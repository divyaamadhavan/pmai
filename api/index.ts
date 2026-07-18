import 'dotenv/config';
import { getDb } from '../app/backend/src/db/index.js';
import { connectRedis } from '../app/backend/src/cache/redis.js';
import { seed } from '../app/backend/src/db/seed.js';
import app from '../app/backend/src/app.js';

// Initialise DB synchronously (better-sqlite3 is sync)
getDb();
// Fire-and-forget async init
connectRedis();
seed().catch(() => {});

export default app;
