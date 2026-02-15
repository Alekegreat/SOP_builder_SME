import type { Context, Next } from 'hono';
import type { AppEnv } from '../app.js';

/**
 * Request logging middleware — structured JSON logs
 */
export async function loggerMiddleware(c: Context<AppEnv>, next: Next) {
  const start = Date.now();

  await next();

  const duration = Date.now() - start;

  // Only log non-health/non-favicon requests
  const path = new URL(c.req.url).pathname;
  if (path === '/health' || path === '/favicon.ico') return;

  console.log(JSON.stringify({
    level: 'info',
    method: c.req.method,
    path,
    status: c.res.status,
    duration,
    userId: c.get('auth')?.userId,
    timestamp: new Date().toISOString(),
  }));
}
