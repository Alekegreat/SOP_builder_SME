import type { Context, Next } from 'hono';
import type { AppEnv } from '../app.js';
import { verifyJwt } from '../services/auth.js';

export interface AuthContext {
  userId: string;
  telegramUserId: number;
  name: string;
  /** Populated by RBAC middleware after membership lookup */
  workspaceId?: string;
  /** Populated by RBAC middleware after membership lookup */
  role?: import('@sop/shared').WorkspaceRole;
}

/**
 * JWT authentication middleware.
 * Extracts and validates JWT from Authorization header.
 */
export async function authMiddleware(c: Context<AppEnv>, next: Next) {
  const authHeader = c.req.header('Authorization');

  if (!authHeader?.startsWith('Bearer ')) {
    return c.json(
      { error: { code: 'UNAUTHORIZED', message: 'Missing or invalid Authorization header' } },
      401,
    );
  }

  const token = authHeader.substring(7);
  const payload = await verifyJwt(token, c.env.JWT_SECRET);

  if (!payload) {
    return c.json(
      { error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' } },
      401,
    );
  }

  c.set('auth', {
    userId: payload.sub,
    telegramUserId: payload.tgId,
    name: payload.name,
  });

  await next();
}

/**
 * Get authenticated user from context (throws if not authenticated)
 */
export function getAuth(c: Context<AppEnv>): AuthContext {
  const auth = c.get('auth');
  if (!auth) {
    throw new Error('Not authenticated');
  }
  return auth;
}
