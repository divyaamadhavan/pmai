import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';

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
import agentsRouter from './services/agents/router.js';

const app = express();

app.use(helmet({
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

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
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

app.get('/health', (_req: Request, res: Response) => {
  res.json({ data: { status: 'ok', timestamp: new Date().toISOString() }, error: null });
});

app.use('/api/auth',      authRouter);
app.use('/api/feedback',  feedbackRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/insights',  insightsRouter);
app.use('/api/roadmap',   roadmapRouter);
app.use('/api/sprint',    sprintRouter);
app.use('/api/knowledge', knowledgeRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/projects',  projectsRouter);
app.use('/api/agents',    agentsRouter);

const frontendDist = process.env.VERCEL === '1'
  ? path.join(process.cwd(), 'app/frontend/dist')
  : path.join(__dirname, '..', '..', 'frontend', 'dist');

app.use(express.static(frontendDist));
app.get('*', (_req: Request, res: Response) => {
  res.sendFile(path.join(frontendDist, 'index.html'), (err) => {
    if (err) res.status(404).json({ data: null, error: { message: 'Route not found', code: 'NOT_FOUND' } });
  });
});

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

export default app;
