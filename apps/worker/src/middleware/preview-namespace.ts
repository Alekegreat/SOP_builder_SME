import type { Context, Next } from 'hono';
import type { AppEnv } from '../app.js';

/**
 * Preview namespace middleware.
 * When PREVIEW_NAMESPACE is set (non-production), enforces data isolation
 * so preview environments using a shared D1 database cannot cross-contaminate.
 *
 * In preview mode, workspace IDs are validated to include the namespace prefix.
 * New workspaces created in preview get the namespace prefix automatically.
 */
export function previewNamespaceMiddleware(c: Context<AppEnv>, next: Next) {
  const ns = c.env.PREVIEW_NAMESPACE;
  if (ns) {
    c.set('previewNamespace', ns);
  }
  return next();
}

/**
 * Returns the active preview namespace from context, or null for production.
 */
export function getPreviewNamespace(c: Context<AppEnv>): string | null {
  return (c.get('previewNamespace' as never) as string) ?? null;
}

/**
 * Applies preview namespace prefix to a workspace name during creation.
 * In production (no namespace), returns the name unchanged.
 */
export function namespacedWorkspaceName(name: string, namespace: string | null): string {
  if (!namespace) return name;
  return `[${namespace}] ${name}`;
}

/**
 * Validates that a workspace belongs to the current preview namespace.
 * In production (no namespace), always returns true.
 * In preview, checks that the workspace name contains the namespace prefix.
 */
export function validateWorkspaceNamespace(
  workspaceName: string,
  namespace: string | null,
): boolean {
  if (!namespace) return true; // production — no restriction
  return workspaceName.startsWith(`[${namespace}]`);
}
