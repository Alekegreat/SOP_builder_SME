import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './env.js';
import { authMiddleware, type AuthContext } from './middleware/auth.js';
import { errorHandler } from './middleware/error.js';
import { loggerMiddleware } from './middleware/logger.js';
import { previewNamespaceMiddleware } from './middleware/preview-namespace.js';
import { authRoutes } from './routes/auth.js';
import { sopRoutes } from './routes/sops.js';
import { approvalRoutes } from './routes/approvals.js';
import { billingRoutes } from './routes/billing.js';
import { adminRoutes } from './routes/admin.js';
import { checklistRoutes } from './routes/checklists.js';
import { webhookRoute } from './routes/webhook.js';
import { workspaceRoutes } from './routes/workspace.js';
import { templateRoutes } from './routes/templates.js';
import { analyticsRoutes } from './routes/analytics.js';

export type AppEnv = {
  Bindings: Env;
  Variables: {
    auth?: AuthContext;
    previewNamespace?: string;
  };
};

const app = new Hono<AppEnv>();

// ── Global middleware ──
app.use(
  '*',
  cors({
    origin: '*', // TMA can be served from any Telegram domain
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    maxAge: 86400,
  }),
);

app.use('*', loggerMiddleware);
app.use('*', previewNamespaceMiddleware);
app.onError(errorHandler);

// ── Health check ──
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ── Bot webhook (no auth — validated internally) ──
app.route('/webhook', webhookRoute);

// ── Auth routes ──
app.route('/auth', authRoutes);

// ── Public routes (no auth) ──
app.route('/templates', templateRoutes);

// ── Protected routes ──
app.use('/sops/*', authMiddleware);
app.use('/approvals/*', authMiddleware);
app.use('/admin/*', authMiddleware);
app.use('/checklist_runs/*', authMiddleware);
app.use('/workspace/*', authMiddleware);
app.use('/analytics/*', authMiddleware);

app.route('/sops', sopRoutes);
app.route('/approvals', approvalRoutes);
app.route('/billing', billingRoutes);
app.route('/admin', adminRoutes);
app.route('/checklist_runs', checklistRoutes);
app.route('/workspace', workspaceRoutes);
app.route('/analytics', analyticsRoutes);

// ── 404 ──
app.notFound((c) => c.json({ error: { code: 'NOT_FOUND', message: 'Route not found' } }, 404));

export default app;
