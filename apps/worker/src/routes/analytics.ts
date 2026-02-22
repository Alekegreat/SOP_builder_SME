import { Hono } from 'hono';
import type { AppEnv } from '../app.js';
import { getAuth } from '../middleware/auth.js';
import { assertPermission } from '../services/rbac.js';
import type { WorkspaceRole } from '@sop/shared';

export const analyticsRoutes = new Hono<AppEnv>();

async function getMembership(db: D1Database, workspaceId: string, userId: string) {
  const m = await db
    .prepare('SELECT role FROM memberships WHERE workspace_id = ? AND user_id = ?')
    .bind(workspaceId, userId)
    .first<{ role: string }>();
  if (!m) throw new Error('FORBIDDEN: Not a member of this workspace');
  return m.role as WorkspaceRole;
}

/**
 * GET /analytics — Workspace analytics summary
 */
analyticsRoutes.get('/', async (c) => {
  const auth = getAuth(c);
  const workspaceId = c.req.query('workspaceId');

  if (!workspaceId) {
    return c.json({ error: { code: 'BAD_REQUEST', message: 'workspaceId required' } }, 400);
  }

  const role = await getMembership(c.env.DB, workspaceId, auth.userId);
  assertPermission(role, 'sop:read');

  // SOP counts by status
  const statusCounts = await c.env.DB.prepare(
    `SELECT status, COUNT(*) as cnt FROM sops WHERE workspace_id = ? GROUP BY status`,
  )
    .bind(workspaceId)
    .all();

  const statuses: Record<string, number> = {};
  let totalSops = 0;
  for (const row of statusCounts.results ?? []) {
    const s = row.status as string;
    const count = row.cnt as number;
    statuses[s] = count;
    totalSops += count;
  }

  // Stale SOPs
  const now = new Date().toISOString();
  const staleResult = await c.env.DB.prepare(
    `SELECT COUNT(*) as cnt FROM sops
     WHERE workspace_id = ? AND status = 'PUBLISHED'
     AND next_review_at IS NOT NULL AND next_review_at < ?`,
  )
    .bind(workspaceId, now)
    .first<{ cnt: number }>();

  // Pending approvals
  const pendingResult = await c.env.DB.prepare(
    `SELECT COUNT(*) as cnt FROM approvals a
     JOIN sops s ON a.sop_id = s.id
     WHERE s.workspace_id = ? AND a.state = 'PENDING'`,
  )
    .bind(workspaceId)
    .first<{ cnt: number }>();

  // Daily metrics (last 30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .substring(0, 10);
  const dailyMetrics = await c.env.DB.prepare(
    `SELECT date, sops_created, versions_created, interviews_completed, approvals_decided
     FROM daily_metrics
     WHERE workspace_id = ? AND date >= ?
     ORDER BY date ASC`,
  )
    .bind(workspaceId, thirtyDaysAgo)
    .all();

  // Credits
  const period = `${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const credits = await c.env.DB.prepare(
    `SELECT credits_included, credits_bought, credits_used
     FROM usage_credits WHERE workspace_id = ? AND period_yyyymm = ?`,
  )
    .bind(workspaceId, period)
    .first<{ credits_included: number; credits_bought: number; credits_used: number }>();

  return c.json({
    totalSops,
    statusBreakdown: statuses,
    staleSops: staleResult?.cnt ?? 0,
    pendingApprovals: pendingResult?.cnt ?? 0,
    credits: credits
      ? {
          included: credits.credits_included,
          bought: credits.credits_bought,
          used: credits.credits_used,
          remaining: Math.max(
            0,
            credits.credits_included + credits.credits_bought - credits.credits_used,
          ),
        }
      : null,
    dailyMetrics: (dailyMetrics.results ?? []).map((d: Record<string, unknown>) => ({
      date: d.date,
      sopsCreated: d.sops_created,
      versionsCreated: d.versions_created,
      interviewsCompleted: d.interviews_completed,
      approvalsDecided: d.approvals_decided,
    })),
  });
});
