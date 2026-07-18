import 'dotenv/config';
import { connectRedis } from './cache/redis.js';
import app from './app.js';

const PORT = parseInt(process.env.PORT ?? '3000', 10);

async function bootstrap(): Promise<void> {
  try {
    const { getDb } = await import('./db/index.js');
    getDb();
    console.log('[DB] SQLite ready');
  } catch (err) {
    console.error('[DB] Failed to initialise SQLite:', err);
    process.exit(1);
  }

  try {
    const { seed } = await import('./db/seed.js');
    await seed();
  } catch (err) {
    console.warn('[seed] Skipped:', err);
  }

  await connectRedis();

  app.listen(PORT, () => {
    console.log(`[PMAI] Backend listening on http://localhost:${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error('[PMAI] Fatal bootstrap error:', err);
  process.exit(1);
});

export default app;
