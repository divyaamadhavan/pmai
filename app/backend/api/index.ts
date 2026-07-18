import 'dotenv/config';
import type { IncomingMessage, ServerResponse } from 'http';
import { getDb } from '../src/db/index.js';
import { seed } from '../src/db/seed.js';
import app from '../src/app.js';

let initError: unknown = null;

// Synchronous DB init
try {
  getDb();
  console.log('[init] DB ready');
} catch (err) {
  initError = err;
  console.error('[init] DB FAILED:', err);
}

// Seed is async-shaped but all sync internally
const ready: Promise<void> = initError
  ? Promise.resolve()
  : seed()
      .then(() => console.log('[init] Seed done'))
      .catch((err) => {
        initError = err;
        console.error('[init] Seed FAILED:', err);
      });

export default async (req: IncomingMessage, res: ServerResponse) => {
  await ready;
  if (initError) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({ data: null, error: { message: String(initError), code: 'INIT_FAILED' } })
    );
    return;
  }
  app(req, res);
};
