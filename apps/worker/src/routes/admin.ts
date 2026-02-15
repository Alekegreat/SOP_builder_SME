import { Hono } from 'hono';
import type { AppEnv } from '../app.js';
import { getAuth } from '../middleware/auth.js';
import { assertPermission } from '../services/rbac.js';
import { queryAuditLogs } from '../services/audit.js';
import { recordPaymentEvent, isPaymentProcessed } from '../services/payments.js';
import { updatePlan, addCredits } from '../services/billing.js';
import { AuditLogQuerySchema, ManualPaymentConfirmSchema } from '@sop/shared';
import type { WorkspaceRole } from '@sop/shared';

export const adminRoutes = new Hono<AppEnv>();

async function getMembership(db: D1Database, workspaceId: string, userId: string) {
  const m = await db
    .prepare('SELECT role FROM memberships WHERE workspace_id = ? AND user_id = ?')
    .bind(workspaceId, userId)
    .first<{ role: string }>();
  if (!m) throw new Error('FORBIDDEN: Not a member of this workspace');
  return m.role as WorkspaceRole;
}

/**
 * GET /admin/audit_logs — Query audit logs
 */
adminRoutes.get('/audit_logs', async (c) => {
  const auth = getAuth(c);
  const query = AuditLogQuerySchema.parse({
    workspaceId: c.req.query('workspaceId'),
    limit: c.req.query('limit') ? parseInt(c.req.query('limit')!) : undefined,
    offset: c.req.query('offset') ? parseInt(c.req.query('offset')!) : undefined,
    action: c.req.query('action') || undefined,
    entityType: c.req.query('entityType') || undefined,
  });

  const role = await getMembership(c.env.DB, query.workspaceId, auth.userId);
  assertPermission(role, 'admin:audit_logs');

  const result = await queryAuditLogs(c.env.DB, query.workspaceId, {
    limit: query.limit,
    offset: query.offset,
    action: query.action,
    entityType: query.entityType,
  });

  return c.json({
    data: result.logs.map((log) => ({
      ...log,
      metaJson: log.meta_json ? JSON.parse(log.meta_json) : null,
    })),
    total: result.total,
    limit: query.limit,
    offset: query.offset,
  });
});

/**
 * POST /admin/manual_payment_confirm — Manually confirm a payment
 */
adminRoutes.post('/manual_payment_confirm', async (c) => {
  const auth = getAuth(c);
  const body = await c.req.json();
  const parsed = ManualPaymentConfirmSchema.parse(body);

  const role = await getMembership(c.env.DB, parsed.workspaceId, auth.userId);
  assertPermission(role, 'admin:manual_payment');

  // Idempotency
  if (await isPaymentProcessed(c.env.DB, parsed.provider, parsed.externalId)) {
    return c.json({ ok: true, deduplicated: true });
  }

  await recordPaymentEvent(c.env.DB, {
    workspaceId: parsed.workspaceId,
    provider: parsed.provider,
    status: 'completed',
    externalId: parsed.externalId,
    amount: parsed.amount,
    currency: parsed.currency,
    rawJson: { ...parsed, confirmedBy: auth.userId, manual: true },
  });

  if (parsed.planId) {
    await updatePlan(c.env.DB, parsed.workspaceId, parsed.planId);
  }
  if (parsed.credits) {
    await addCredits(c.env.DB, parsed.workspaceId, parsed.credits);
  }

  return c.json({ ok: true, status: 'confirmed' });
});
