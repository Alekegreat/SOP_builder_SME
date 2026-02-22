import { Hono } from 'hono';
import type { AppEnv } from '../app.js';
import { getAuth } from '../middleware/auth.js';
import { assertPermission } from '../services/rbac.js';
import { writeAuditLog } from '../services/audit.js';
import { incrementMetric } from '../services/billing.js';
import { CreateApprovalSchema, DecideApprovalSchema } from '@sop/shared';
import type { WorkspaceRole } from '@sop/shared';

export const approvalRoutes = new Hono<AppEnv>();

async function getMembership(db: D1Database, workspaceId: string, userId: string) {
  const m = await db
    .prepare('SELECT role FROM memberships WHERE workspace_id = ? AND user_id = ?')
    .bind(workspaceId, userId)
    .first<{ role: string }>();
  if (!m) throw new Error('FORBIDDEN: Not a member of this workspace');
  return m.role as WorkspaceRole;
}

/**
 * GET /approvals/inbox — Get pending approvals for current user
 */
approvalRoutes.get('/inbox', async (c) => {
  const auth = getAuth(c);
  const workspaceId = c.req.query('workspaceId');
  if (!workspaceId) {
    return c.json({ error: { code: 'BAD_REQUEST', message: 'workspaceId required' } }, 400);
  }

  const role = await getMembership(c.env.DB, workspaceId, auth.userId);
  assertPermission(role, 'approval:read');

  const approvals = await c.env.DB.prepare(
    `SELECT a.*, s.title as sop_title, sv.semver
     FROM approvals a
     JOIN sops s ON a.sop_id = s.id
     JOIN sop_versions sv ON a.version_id = sv.id
     WHERE a.approver_user_id = ? AND a.state = 'PENDING'
     AND s.workspace_id = ?
     ORDER BY sv.created_at DESC`,
  )
    .bind(auth.userId, workspaceId)
    .all();

  return c.json({ data: approvals.results ?? [] });
});

/**
 * POST /approvals — Create an approval request
 */
approvalRoutes.post('/', async (c) => {
  const auth = getAuth(c);
  const body = await c.req.json();
  const parsed = CreateApprovalSchema.parse(body);

  // Look up workspace from SOP
  const sop = await c.env.DB.prepare('SELECT workspace_id FROM sops WHERE id = ?')
    .bind(parsed.sopId)
    .first<{ workspace_id: string }>();
  if (!sop) return c.json({ error: { code: 'NOT_FOUND', message: 'SOP not found' } }, 404);

  const role = await getMembership(c.env.DB, sop.workspace_id, auth.userId);
  assertPermission(role, 'approval:create');

  // Check version exists
  const version = await c.env.DB.prepare('SELECT id FROM sop_versions WHERE id = ? AND sop_id = ?')
    .bind(parsed.versionId, parsed.sopId)
    .first();
  if (!version) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Version not found' } }, 404);
  }

  // Check approver is a member with approver+ role
  const approverMembership = await c.env.DB.prepare(
    'SELECT role FROM memberships WHERE workspace_id = ? AND user_id = ?',
  )
    .bind(sop.workspace_id, parsed.approverUserId)
    .first<{ role: string }>();

  if (!approverMembership) {
    return c.json(
      { error: { code: 'BAD_REQUEST', message: 'Approver is not a workspace member' } },
      400,
    );
  }

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO approvals (id, sop_id, version_id, state, approver_user_id)
     VALUES (?, ?, ?, 'PENDING', ?)`,
  )
    .bind(id, parsed.sopId, parsed.versionId, parsed.approverUserId)
    .run();

  // Update SOP status
  await c.env.DB.prepare("UPDATE sops SET status = 'IN_REVIEW' WHERE id = ?")
    .bind(parsed.sopId)
    .run();

  await writeAuditLog(c.env.DB, {
    workspaceId: sop.workspace_id,
    actorUserId: auth.userId,
    action: 'approval.requested',
    entityType: 'approval',
    entityId: id,
    meta: {
      sopId: parsed.sopId,
      versionId: parsed.versionId,
      approverUserId: parsed.approverUserId,
    },
  });

  return c.json(
    {
      id,
      sopId: parsed.sopId,
      versionId: parsed.versionId,
      state: 'PENDING',
      approverUserId: parsed.approverUserId,
    },
    201,
  );
});

/**
 * POST /approvals/:id/decide — Approve or reject
 */
approvalRoutes.post('/:id/decide', async (c) => {
  const auth = getAuth(c);
  const approvalId = c.req.param('id');
  const body = await c.req.json();
  const parsed = DecideApprovalSchema.parse(body);

  const approval = await c.env.DB.prepare('SELECT * FROM approvals WHERE id = ?')
    .bind(approvalId)
    .first();
  if (!approval)
    return c.json({ error: { code: 'NOT_FOUND', message: 'Approval not found' } }, 404);

  if (approval.state !== 'PENDING') {
    return c.json(
      { error: { code: 'CONFLICT', message: 'Approval has already been decided' } },
      409,
    );
  }

  if (approval.approver_user_id !== auth.userId) {
    return c.json(
      { error: { code: 'FORBIDDEN', message: 'Only the assigned approver can decide' } },
      403,
    );
  }

  const sop = await c.env.DB.prepare('SELECT workspace_id FROM sops WHERE id = ?')
    .bind(approval.sop_id)
    .first<{ workspace_id: string }>();
  if (!sop) return c.json({ error: { code: 'NOT_FOUND', message: 'SOP not found' } }, 404);

  const role = await getMembership(c.env.DB, sop.workspace_id, auth.userId);
  assertPermission(role, 'approval:decide');

  const now = new Date().toISOString();
  await c.env.DB.prepare('UPDATE approvals SET state = ?, decided_at = ?, comment = ? WHERE id = ?')
    .bind(parsed.decision, now, parsed.comment ?? null, approvalId)
    .run();

  // Update SOP status based on decision
  const newSopStatus = parsed.decision === 'APPROVED' ? 'APPROVED' : 'DRAFT';
  await c.env.DB.prepare('UPDATE sops SET status = ? WHERE id = ?')
    .bind(newSopStatus, approval.sop_id)
    .run();

  const auditAction = parsed.decision === 'APPROVED' ? 'approval.approved' : 'approval.rejected';
  await writeAuditLog(c.env.DB, {
    workspaceId: sop.workspace_id,
    actorUserId: auth.userId,
    action: auditAction,
    entityType: 'approval',
    entityId: approvalId,
    meta: { decision: parsed.decision, comment: parsed.comment },
  });

  await incrementMetric(c.env.DB, sop.workspace_id, 'approvals_decided');

  // Notify SOP owner of the decision
  const sopDetail = await c.env.DB.prepare('SELECT title, owner_user_id FROM sops WHERE id = ?')
    .bind(approval.sop_id)
    .first<{ title: string; owner_user_id: string }>();

  if (sopDetail) {
    const ownerUser = await c.env.DB.prepare('SELECT telegram_user_id FROM users WHERE id = ?')
      .bind(sopDetail.owner_user_id)
      .first<{ telegram_user_id: number }>();

    if (ownerUser?.telegram_user_id) {
      const emoji = parsed.decision === 'APPROVED' ? '✅' : '❌';
      const text = `${emoji} Your SOP "${sopDetail.title}" has been ${parsed.decision.toLowerCase()}.${parsed.comment ? `\n\nComment: ${parsed.comment}` : ''}`;

      await fetch(`https://api.telegram.org/bot${c.env.BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: ownerUser.telegram_user_id,
          text,
        }),
      }).catch((err) => console.error('Failed to notify SOP owner:', err));
    }
  }

  return c.json({
    id: approvalId,
    state: parsed.decision,
    decidedAt: now,
  });
});
