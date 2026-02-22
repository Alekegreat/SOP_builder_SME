import { Hono } from 'hono';
import type { AppEnv } from '../app.js';
import { requirePermission } from '../middleware/rbac.js';
import { getAuth } from '../middleware/auth.js';
import { encrypt } from '../services/encryption.js';
import { isHigherRole } from '../services/rbac.js';
import type { WorkspaceRole } from '@sop/shared';

export const workspaceRoutes = new Hono<AppEnv>();

// ── GET /workspace/settings ──
workspaceRoutes.get('/settings', requirePermission('sop:read'), async (c) => {
  const auth = getAuth(c);
  const ws = await c.env.DB.prepare(
    'SELECT id, name, plan, policy_json FROM workspaces WHERE id = ?',
  )
    .bind(auth.workspaceId)
    .first<{ id: string; name: string; plan: string; policy_json: string }>();

  if (!ws) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Workspace not found' } }, 404);
  }

  let policy: Record<string, unknown> = {};
  try {
    policy = JSON.parse(ws.policy_json || '{}');
  } catch {
    // default to empty
  }

  return c.json({
    id: ws.id,
    name: ws.name,
    plan: ws.plan,
    reviewCycleDays: (policy.reviewCycleDays as number) ?? 90,
    strictApprovals: (policy.strictApprovals as boolean) ?? false,
    requireApprovalToPublish: (policy.requireApprovalToPublish as boolean) ?? false,
  });
});

// ── PUT /workspace/settings ──
workspaceRoutes.put('/settings', requirePermission('workspace:settings'), async (c) => {
  const auth = getAuth(c);
  const body = await c.req.json<{
    name?: string;
    reviewCycleDays?: number;
    strictApprovals?: boolean;
    requireApprovalToPublish?: boolean;
  }>();

  // Build policy JSON
  const existing = await c.env.DB.prepare('SELECT policy_json FROM workspaces WHERE id = ?')
    .bind(auth.workspaceId)
    .first<{ policy_json: string }>();

  let policy: Record<string, unknown> = {};
  try {
    policy = JSON.parse(existing?.policy_json || '{}');
  } catch {
    // default
  }

  if (body.reviewCycleDays !== undefined) policy.reviewCycleDays = body.reviewCycleDays;
  if (body.strictApprovals !== undefined) policy.strictApprovals = body.strictApprovals;
  if (body.requireApprovalToPublish !== undefined)
    policy.requireApprovalToPublish = body.requireApprovalToPublish;

  const updates: string[] = [];
  const bindings: unknown[] = [];

  updates.push('policy_json = ?');
  bindings.push(JSON.stringify(policy));

  if (body.name) {
    updates.push('name = ?');
    bindings.push(body.name);
  }

  bindings.push(auth.workspaceId);

  await c.env.DB.prepare(`UPDATE workspaces SET ${updates.join(', ')} WHERE id = ?`)
    .bind(...bindings)
    .run();

  // Audit log
  await c.env.DB.prepare(
    'INSERT INTO audit_logs (id, workspace_id, user_id, action, entity_type, entity_id, at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(
      crypto.randomUUID(),
      auth.workspaceId,
      auth.userId,
      'workspace.settings_changed',
      'workspace',
      auth.workspaceId,
      new Date().toISOString(),
    )
    .run();

  return c.json({ status: 'updated' });
});

// ── PUT /workspace/ai-config ──
workspaceRoutes.put('/ai-config', requirePermission('workspace:settings'), async (c) => {
  const auth = getAuth(c);
  const body = await c.req.json<{
    provider: string;
    model: string;
    apiKey?: string;
  }>();

  const config: Record<string, unknown> = {
    provider: body.provider,
    model: body.model,
  };

  // Encrypt API key if provided
  if (body.apiKey) {
    const encrypted = await encrypt(body.apiKey, c.env.ENCRYPTION_KEY);
    config.encryptedApiKey = encrypted;
  }

  await c.env.DB.prepare('UPDATE workspaces SET ai_config_json = ? WHERE id = ?')
    .bind(JSON.stringify(config), auth.workspaceId)
    .run();

  // Audit log
  await c.env.DB.prepare(
    'INSERT INTO audit_logs (id, workspace_id, user_id, action, entity_type, entity_id, at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(
      crypto.randomUUID(),
      auth.workspaceId,
      auth.userId,
      'workspace.settings_changed',
      'workspace',
      auth.workspaceId,
      new Date().toISOString(),
    )
    .run();

  return c.json({ status: 'updated' });
});

// ── GET /workspace/members ──
workspaceRoutes.get('/members', requirePermission('sop:read'), async (c) => {
  const auth = getAuth(c);

  const members = await c.env.DB.prepare(
    `SELECT m.user_id, m.role, u.name, u.telegram_user_id
       FROM memberships m
       JOIN users u ON u.id = m.user_id
       WHERE m.workspace_id = ?
       ORDER BY
         CASE m.role
           WHEN 'owner' THEN 1
           WHEN 'admin' THEN 2
           WHEN 'editor' THEN 3
           WHEN 'approver' THEN 4
           WHEN 'viewer' THEN 5
         END`,
  )
    .bind(auth.workspaceId)
    .all<{ user_id: string; role: string; name: string; telegram_user_id: number }>();

  return c.json({ data: members.results ?? [] });
});

// ── POST /workspace/members/invite ──
workspaceRoutes.post('/members/invite', requirePermission('member:invite'), async (c) => {
  const auth = getAuth(c);
  const body = await c.req.json<{
    telegramUserId: number;
    role?: string;
  }>();

  if (!body.telegramUserId) {
    return c.json({ error: { code: 'BAD_REQUEST', message: 'telegramUserId is required' } }, 400);
  }

  const role = (body.role as WorkspaceRole) ?? 'viewer';

  // Find user by telegram ID
  const user = await c.env.DB.prepare('SELECT id FROM users WHERE telegram_user_id = ?')
    .bind(body.telegramUserId)
    .first<{ id: string }>();

  if (!user) {
    return c.json(
      { error: { code: 'NOT_FOUND', message: 'User not found. They must start the bot first.' } },
      404,
    );
  }

  // Check not already a member
  const existing = await c.env.DB.prepare(
    'SELECT user_id FROM memberships WHERE workspace_id = ? AND user_id = ?',
  )
    .bind(auth.workspaceId, user.id)
    .first();

  if (existing) {
    return c.json({ error: { code: 'CONFLICT', message: 'User is already a member' } }, 409);
  }

  await c.env.DB.prepare('INSERT INTO memberships (workspace_id, user_id, role) VALUES (?, ?, ?)')
    .bind(auth.workspaceId, user.id, role)
    .run();

  // Audit log
  await c.env.DB.prepare(
    'INSERT INTO audit_logs (id, workspace_id, user_id, action, entity_type, entity_id, details_json, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(
      crypto.randomUUID(),
      auth.workspaceId,
      auth.userId,
      'member.invited',
      'membership',
      user.id,
      JSON.stringify({ role, telegramUserId: body.telegramUserId }),
      new Date().toISOString(),
    )
    .run();

  return c.json({ status: 'invited', userId: user.id, role }, 201);
});

// ── PUT /workspace/members/:userId/role ──
workspaceRoutes.put('/members/:userId/role', requirePermission('member:change_role'), async (c) => {
  const auth = getAuth(c);
  const targetUserId = c.req.param('userId');
  const body = await c.req.json<{ role: string }>();

  if (!body.role) {
    return c.json({ error: { code: 'BAD_REQUEST', message: 'role is required' } }, 400);
  }

  const newRole = body.role as WorkspaceRole;

  // Cannot assign role equal or higher than own (except owner)
  if (auth.role !== 'owner' && !isHigherRole(auth.role!, newRole)) {
    return c.json(
      {
        error: { code: 'FORBIDDEN', message: 'Cannot assign a role equal or higher than your own' },
      },
      403,
    );
  }

  // Cannot change own role
  if (targetUserId === auth.userId) {
    return c.json({ error: { code: 'FORBIDDEN', message: 'Cannot change your own role' } }, 403);
  }

  // Check target is a member
  const membership = await c.env.DB.prepare(
    'SELECT role FROM memberships WHERE workspace_id = ? AND user_id = ?',
  )
    .bind(auth.workspaceId, targetUserId)
    .first<{ role: string }>();

  if (!membership) {
    return c.json(
      { error: { code: 'NOT_FOUND', message: 'User is not a member of this workspace' } },
      404,
    );
  }

  await c.env.DB.prepare('UPDATE memberships SET role = ? WHERE workspace_id = ? AND user_id = ?')
    .bind(newRole, auth.workspaceId, targetUserId)
    .run();

  // Audit log
  await c.env.DB.prepare(
    'INSERT INTO audit_logs (id, workspace_id, user_id, action, entity_type, entity_id, details_json, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(
      crypto.randomUUID(),
      auth.workspaceId,
      auth.userId,
      'member.role_changed',
      'membership',
      targetUserId,
      JSON.stringify({ from: membership.role, to: newRole }),
      new Date().toISOString(),
    )
    .run();

  return c.json({ status: 'updated', userId: targetUserId, role: newRole });
});
