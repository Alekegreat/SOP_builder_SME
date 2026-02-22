import type { Context, Next } from 'hono';
import type { AppEnv } from '../app.js';
import { assertPermission, type Permission } from '../services/rbac.js';
import type { WorkspaceRole } from '@sop/shared';

/**
 * Workspace RBAC middleware factory.
 * Resolves workspace membership and checks permission.
 */
export function requirePermission(permission: Permission) {
  return async (c: Context<AppEnv>, next: Next) => {
    const auth = c.get('auth');
    if (!auth) {
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, 401);
    }

    // Get workspace ID from path params or query
    const workspaceId =
      c.req.param('workspaceId') ??
      c.req.query('workspaceId') ??
      (await extractWorkspaceIdFromBody(c));

    if (!workspaceId) {
      return c.json({ error: { code: 'BAD_REQUEST', message: 'workspaceId is required' } }, 400);
    }

    // Lookup membership
    const membership = await c.env.DB.prepare(
      'SELECT role FROM memberships WHERE workspace_id = ? AND user_id = ?',
    )
      .bind(workspaceId, auth.userId)
      .first<{ role: string }>();

    if (!membership) {
      return c.json(
        { error: { code: 'FORBIDDEN', message: 'Not a member of this workspace' } },
        403,
      );
    }

    // Check permission
    assertPermission(membership.role as WorkspaceRole, permission);

    // Store workspace context for downstream use
    c.set('auth', {
      ...auth,
      workspaceId,
      role: membership.role as WorkspaceRole,
    });

    await next();
  };
}

async function extractWorkspaceIdFromBody(c: Context<AppEnv>): Promise<string | undefined> {
  try {
    if (c.req.method === 'POST' || c.req.method === 'PUT' || c.req.method === 'PATCH') {
      const body = await c.req.json();
      return body?.workspaceId;
    }
  } catch {
    // Body parsing failed — that's fine
  }
  return undefined;
}
