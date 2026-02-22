import { Hono } from 'hono';
import type { AppEnv } from '../app.js';
import { TelegramAuthSchema } from '@sop/shared';
import { validateInitData, createJwt } from '../services/auth.js';
import { checkRateLimit } from '../services/rate-limiter.js';
import { writeAuditLog } from '../services/audit.js';

export const authRoutes = new Hono<AppEnv>();

/**
 * POST /auth/telegram
 * Validate initData and issue JWT
 */
authRoutes.post('/telegram', async (c) => {
  const body = await c.req.json();
  const parsed = TelegramAuthSchema.parse(body);

  const validation = await validateInitData(parsed.initData, c.env.BOT_TOKEN);
  if (!validation.valid || !validation.user) {
    return c.json({ error: { code: 'UNAUTHORIZED', message: 'Invalid Telegram initData' } }, 401);
  }

  const tgUser = validation.user;

  // Rate limit auth attempts
  const rateResult = await checkRateLimit(c.env.DB, String(tgUser.id), 'auth');
  if (!rateResult.allowed) {
    return c.json({ error: { code: 'RATE_LIMITED', message: 'Too many auth attempts' } }, 429);
  }

  // Upsert user
  const userName = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ');
  const now = new Date().toISOString();

  let user = await c.env.DB.prepare(
    'SELECT id, telegram_user_id, name, created_at FROM users WHERE telegram_user_id = ?',
  )
    .bind(tgUser.id)
    .first<{ id: string; telegram_user_id: number; name: string; created_at: string }>();

  let createdWorkspaceId: string | null = null;

  if (!user) {
    const userId = crypto.randomUUID();
    await c.env.DB.prepare(
      'INSERT INTO users (id, telegram_user_id, name, created_at) VALUES (?, ?, ?, ?)',
    )
      .bind(userId, tgUser.id, userName, now)
      .run();

    user = { id: userId, telegram_user_id: tgUser.id, name: userName, created_at: now };

    // Create default workspace for new user
    createdWorkspaceId = crypto.randomUUID();
    await c.env.DB.prepare(
      `INSERT INTO workspaces (id, name, owner_user_id, plan, policy_json, created_at)
       VALUES (?, ?, ?, 'FREE', '{"strictApprovals":false,"defaultReviewCycleDays":90,"requireApprovalForPublish":false}', ?)`,
    )
      .bind(createdWorkspaceId, `${userName}'s Workspace`, userId, now)
      .run();

    await c.env.DB.prepare(
      "INSERT INTO memberships (workspace_id, user_id, role) VALUES (?, ?, 'owner')",
    )
      .bind(createdWorkspaceId, userId)
      .run();

    // Initialize usage credits
    const period = `${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    await c.env.DB.prepare(
      'INSERT INTO usage_credits (workspace_id, period_yyyymm, credits_included, credits_bought, credits_used) VALUES (?, ?, 0, 0, 0)',
    )
      .bind(createdWorkspaceId, period)
      .run();

    await writeAuditLog(c.env.DB, {
      workspaceId: createdWorkspaceId,
      actorUserId: userId,
      action: 'workspace.created',
      entityType: 'workspace',
      entityId: createdWorkspaceId,
    });
  }

  const defaultWorkspace = await c.env.DB.prepare(
    `SELECT workspace_id FROM memberships
     WHERE user_id = ?
     ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, workspace_id ASC
     LIMIT 1`,
  )
    .bind(user.id)
    .first<{ workspace_id: string }>();

  const workspaceId = defaultWorkspace?.workspace_id ?? createdWorkspaceId ?? '';

  // Issue JWT
  const token = await createJwt(
    { sub: user.id, tgId: user.telegram_user_id, name: user.name },
    c.env.JWT_SECRET,
  );

  return c.json({
    accessToken: token,
    user: {
      id: user.id,
      telegramUserId: user.telegram_user_id,
      name: user.name,
    },
    workspaceId,
  });
});
