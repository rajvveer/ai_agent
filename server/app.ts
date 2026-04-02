import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';

// Middleware
import { authMiddleware } from './middleware/auth.js';
import { tenantMiddleware } from './middleware/tenant.js';
import { featureFlagMiddleware } from './middleware/featureFlags.js';
import { rateLimiter } from './middleware/rateLimiter.js';
import { costTracker } from './middleware/costTracker.js';
import { requestLogger } from './middleware/logger.js';
import { errorHandler } from './middleware/errors.js';

// Module routers
import { authRouter } from './modules/auth/router.js';
import { agentRouter } from './modules/agent/router.js';

// Webhook router
import { webhookRouter } from './webhooks/router.js';

const app = express();

// ─── Global Middleware ─────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

// ─── Health Check (no auth required) ───────────────────
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'business-copilot-backend',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '1.0.0',
  });
});

// ─── Auth Routes (no tenant middleware needed) ─────────
app.use('/api/auth', authRouter);

// ─── Webhook Routes (no auth middleware) ───────────────
app.use('/webhooks', webhookRouter);

// ─── Protected API Routes ──────────────────────────────
// Middleware applied in order for all /api/* routes (except /api/auth)
app.use('/api', rateLimiter);
app.use('/api', authMiddleware);
app.use('/api', tenantMiddleware);
app.use('/api', featureFlagMiddleware);
app.use('/api', costTracker);

// Module routes
app.use('/api/agent', agentRouter);

// Placeholder routes for future phases
// app.use('/api/finance',    financeRouter);    // Phase 3
// app.use('/api/crm',        crmRouter);        // Phase 3
// app.use('/api/marketing',  marketingRouter);  // Phase 6
// app.use('/api/hiring',     hiringRouter);     // Phase 10
// app.use('/api/voice',      voiceRouter);      // Phase 13
// app.use('/api/admin',      resellerRouter);   // Phase 10

// ─── 404 Handler ───────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({
    error: 'NotFound',
    message: 'The requested endpoint does not exist.',
  });
});

// ─── Global Error Handler ──────────────────────────────
app.use(errorHandler);

export default app;
