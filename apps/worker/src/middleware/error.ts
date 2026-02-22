import type { Context } from 'hono';
import type { AppEnv } from '../app.js';
import { RBACError } from '../services/rbac.js';
import { ZodError } from 'zod';

/**
 * Global error handler
 */
export function errorHandler(err: Error, c: Context<AppEnv>) {
  // Structured error logging
  console.error(
    JSON.stringify({
      level: 'error',
      message: err.message,
      name: err.name,
      stack: err.stack?.substring(0, 500),
      url: c.req.url,
      method: c.req.method,
      timestamp: new Date().toISOString(),
    }),
  );

  if (err instanceof RBACError) {
    return c.json(
      {
        error: {
          code: 'FORBIDDEN',
          message: err.message,
          details: { permission: err.permission, role: err.role },
        },
      },
      403,
    );
  }

  if (err instanceof ZodError) {
    return c.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: err.errors,
        },
      },
      400,
    );
  }

  if (err.message.includes('NOT_FOUND') || err.message.includes('not found')) {
    return c.json({ error: { code: 'NOT_FOUND', message: err.message } }, 404);
  }

  if (err.message.includes('RATE_LIMITED')) {
    return c.json({ error: { code: 'RATE_LIMITED', message: 'Too many requests' } }, 429);
  }

  if (err.message.includes('CONFLICT') || err.message.includes('already exists')) {
    return c.json({ error: { code: 'CONFLICT', message: err.message } }, 409);
  }

  // Default 500
  return c.json(
    {
      error: {
        code: 'INTERNAL_ERROR',
        message: c.env.ENVIRONMENT === 'production' ? 'Internal server error' : err.message,
      },
    },
    500,
  );
}
