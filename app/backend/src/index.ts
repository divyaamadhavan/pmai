import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { connectRedis } from './cache/redis.js';
import { pool } from './db/index.js';

// Service routers
import authRouter from './services/auth/router.js';
import feedbackRouter from './services/feedback/router.js';
import documentsRouter from './services/documents/router.js';
import insightsRouter from './services/insights/router.js';
import roadmapRouter from './services/roadmap/router.js';
import sprintRouter from './services/sprint/router.js';
import knowledgeRouter from './services/knowledge/router.js';
import dashboardRouter from './services/dashboard/router.js';
import projectsRouter from './services/projects/router.js';

// ─── App ──────────────────────────────────────────────────────────────────────

const app = express();
const PORT = parseInt(process.env.PORT ?? '3000', 10);

// ─── Security & parsing middleware ────────────────────────────────────────────

app.use(helmet({
  // Allow SSE by not setting noSniff incorrectly; helmet defaults are fine
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

app.use(cors({
  origin: process.env.CORS_ORIGIN ?? '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Content-Type'],
  credentials: true,
}));

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Rate limiting ────────────────────────────────────────────────────────────

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { data: null, error: { message: 'Too many requests', code: 'RATE_LIMITED' } },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { data: null, error: { message: 'Too many auth requests', code: 'RATE_LIMITED' } },
});

app.use('/api', globalLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/refresh', authLimiter);

// ─── Health check (no auth) ───────────────────────────────────────────────────

app.get('/health', (_req: Request, res: Response) => {
  res.json({ data: { status: 'ok', timestamp: new Date().toISOString() }, error: null });
});

// ─── Service routers ──────────────────────────────────────────────────────────

app.use('/api/auth',      authRouter);
app.use('/api/feedback',  feedbackRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/insights',  insightsRouter);
app.use('/api/roadmap',   roadmapRouter);
app.use('/api/sprint',    sprintRouter);
app.use('/api/knowledge', knowledgeRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/projects',  projectsRouter);

// ─── Serve frontend (production) ─────────────────────────────────────────────

const frontendDist = path.join(__dirname, '..', '..', 'frontend', 'dist');
app.use(express.static(frontendDist));
app.get('*', (_req: Request, res: Response) => {
  const indexPath = path.join(frontendDist, 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) res.status(404).json({ data: null, error: { message: 'Route not found', code: 'NOT_FOUND' } });
  });
});

// ─── Global error handler ─────────────────────────────────────────────────────

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Unhandled error]', err);
  res.status(500).json({
    data: null,
    error: {
      message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
      code: 'INTERNAL_ERROR',
    },
  });
});

// ─── Bootstrap ────────────────────────────────────────────────────────────────

async function bootstrap(): Promise<void> {
  // Initialise SQLite (creates the file and runs schema automatically)
  try {
    const { getDb } = await import('./db/index.js');
    getDb();
    console.log('[DB] SQLite ready');
  } catch (err) {
    console.error('[DB] Failed to initialise SQLite:', err);
    process.exit(1);
  }

  // Auto-seed on first run (creates demo user + product area)
  try {
    const { seed } = await import('./db/seed.js');
    await seed();
  } catch (err) {
    console.warn('[seed] Skipped:', err);
  }

  // In-memory cache (no Redis needed)
  await connectRedis();

  app.listen(PORT, () => {
    console.log(`[PMAI] Backend listening on http://localhost:${PORT}`);
    console.log(`[PMAI] Routes mounted:`);
    console.log(`  GET  /health`);
    console.log(`  POST /api/auth/login`);
    console.log(`  POST /api/auth/refresh`);
    console.log(`  POST /api/auth/logout`);
    console.log(`  GET  /api/auth/me`);
    console.log(`  POST /api/auth/register`);
    console.log(`  GET  /api/feedback`);
    console.log(`  POST /api/feedback/sync`);
    console.log(`  GET  /api/feedback/themes`);
    console.log(`  GET  /api/feedback/sentiment`);
    console.log(`  POST /api/feedback/items/:id/flag`);
    console.log(`  GET  /api/feedback/stream/sync/:jobId  (SSE)`);
    console.log(`  GET  /api/documents`);
    console.log(`  POST /api/documents  (SSE)`);
    console.log(`  GET  /api/documents/:id`);
    console.log(`  PUT  /api/documents/:id`);
    console.log(`  POST /api/documents/:id/regenerate-section  (SSE)`);
    console.log(`  GET  /api/documents/:id/stream  (SSE)`);
    console.log(`  GET  /api/insights/opportunities`);
    console.log(`  POST /api/insights/generate  (SSE)`);
    console.log(`  POST /api/insights/export`);
    console.log(`  GET  /api/roadmap`);
    console.log(`  POST /api/roadmap`);
    console.log(`  PUT  /api/roadmap/:id`);
    console.log(`  DELETE /api/roadmap/:id`);
    console.log(`  POST /api/roadmap/:id/justification  (SSE)`);
    console.log(`  POST /api/roadmap/tradeoff  (SSE)`);
    console.log(`  GET  /api/sprint/tickets`);
    console.log(`  POST /api/sprint/tickets/generate  (SSE)`);
    console.log(`  GET  /api/sprint/sprints`);
    console.log(`  POST /api/sprint/sprints`);
    console.log(`  POST /api/sprint/sprints/:id/brief  (SSE)`);
    console.log(`  POST /api/sprint/groom`);
    console.log(`  GET  /api/knowledge/search`);
    console.log(`  POST /api/knowledge/index`);
    console.log(`  POST /api/knowledge/qa  (SSE)`);
    console.log(`  GET  /api/dashboard/stats`);
    console.log(`  POST /api/feedback/upload`);
  });
}

bootstrap().catch((err) => {
  console.error('[PMAI] Fatal bootstrap error:', err);
  process.exit(1);
});

export default app;
