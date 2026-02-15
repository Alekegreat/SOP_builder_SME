import { Hono } from 'hono';
import type { AppEnv } from '../app.js';
import { getAuth } from '../middleware/auth.js';
import { assertPermission } from '../services/rbac.js';
import { checkRateLimit } from '../services/rate-limiter.js';
import { writeAuditLog } from '../services/audit.js';
import { incrementMetric, hasCredits } from '../services/billing.js';
import { CreateSopSchema, SopListQuerySchema, InterviewAnswerSchema, ENTITLEMENTS } from '@sop/shared';
import type { WorkspaceRole, Plan } from '@sop/shared';
import {
  createInterviewState,
  startInterview,
  answerQuestion,
} from '@sop/engine';

export const sopRoutes = new Hono<AppEnv>();

// ── Helper: get membership ──
async function getMembership(db: D1Database, workspaceId: string, userId: string) {
  const m = await db
    .prepare('SELECT role FROM memberships WHERE workspace_id = ? AND user_id = ?')
    .bind(workspaceId, userId)
    .first<{ role: string }>();
  if (!m) throw new Error('FORBIDDEN: Not a member of this workspace');
  return m.role as WorkspaceRole;
}

/**
 * POST /sops — Create a new SOP
 */
sopRoutes.post('/', async (c) => {
  const auth = getAuth(c);
  const body = await c.req.json();
  const parsed = CreateSopSchema.parse(body);

  const role = await getMembership(c.env.DB, parsed.workspaceId, auth.userId);
  assertPermission(role, 'sop:create');

  // Entitlement check: max SOPs
  const workspace = await c.env.DB.prepare('SELECT plan FROM workspaces WHERE id = ?')
    .bind(parsed.workspaceId)
    .first<{ plan: string }>();
  const plan = (workspace?.plan ?? 'FREE') as Plan;
  const entitlements = ENTITLEMENTS[plan];

  if (entitlements.maxSops !== -1) {
    const count = await c.env.DB.prepare(
      'SELECT COUNT(*) as cnt FROM sops WHERE workspace_id = ?',
    )
      .bind(parsed.workspaceId)
      .first<{ cnt: number }>();
    if ((count?.cnt ?? 0) >= entitlements.maxSops) {
      return c.json(
        { error: { code: 'LIMIT_EXCEEDED', message: `Plan limit: max ${entitlements.maxSops} SOPs` } },
        403,
      );
    }
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await c.env.DB.prepare(
    `INSERT INTO sops (id, workspace_id, title, status, owner_user_id, tags_json, created_at)
     VALUES (?, ?, ?, 'DRAFT', ?, ?, ?)`,
  )
    .bind(id, parsed.workspaceId, parsed.title, auth.userId, JSON.stringify(parsed.tags), now)
    .run();

  await writeAuditLog(c.env.DB, {
    workspaceId: parsed.workspaceId,
    actorUserId: auth.userId,
    action: 'sop.created',
    entityType: 'sop',
    entityId: id,
    meta: { title: parsed.title },
  });

  await incrementMetric(c.env.DB, parsed.workspaceId, 'sops_created');

  return c.json({
    id,
    workspaceId: parsed.workspaceId,
    title: parsed.title,
    status: 'DRAFT',
    ownerUserId: auth.userId,
    currentVersionId: null,
    nextReviewAt: null,
    tagsJson: parsed.tags,
    createdAt: now,
  }, 201);
});

/**
 * GET /sops — List SOPs
 */
sopRoutes.get('/', async (c) => {
  const auth = getAuth(c);
  const query = SopListQuerySchema.parse({
    workspaceId: c.req.query('workspaceId'),
    status: c.req.query('status') || undefined,
    search: c.req.query('search') || undefined,
    tag: c.req.query('tag') || undefined,
    limit: c.req.query('limit') ? parseInt(c.req.query('limit')!) : 20,
    offset: c.req.query('offset') ? parseInt(c.req.query('offset')!) : 0,
  });

  const role = await getMembership(c.env.DB, query.workspaceId, auth.userId);
  assertPermission(role, 'sop:read');

  let where = 'WHERE workspace_id = ?';
  const params: unknown[] = [query.workspaceId];

  if (query.status) {
    where += ' AND status = ?';
    params.push(query.status);
  }
  if (query.search) {
    where += ' AND title LIKE ?';
    params.push(`%${query.search}%`);
  }
  if (query.tag) {
    where += " AND tags_json LIKE ?";
    params.push(`%"${query.tag}"%`);
  }

  const countResult = await c.env.DB.prepare(`SELECT COUNT(*) as total FROM sops ${where}`)
    .bind(...params)
    .first<{ total: number }>();

  const sops = await c.env.DB.prepare(
    `SELECT * FROM sops ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
  )
    .bind(...params, query.limit, query.offset)
    .all();

  return c.json({
    data: sops.results?.map((s: Record<string, unknown>) => ({
      ...s,
      tagsJson: JSON.parse((s.tags_json as string) || '[]'),
    })) ?? [],
    total: countResult?.total ?? 0,
    limit: query.limit,
    offset: query.offset,
  });
});

/**
 * GET /sops/:id — Get single SOP
 */
sopRoutes.get('/:id', async (c) => {
  const auth = getAuth(c);
  const id = c.req.param('id');

  const sop = await c.env.DB.prepare('SELECT * FROM sops WHERE id = ?')
    .bind(id)
    .first();
  if (!sop) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'SOP not found' } }, 404);
  }

  const role = await getMembership(c.env.DB, sop.workspace_id as string, auth.userId);
  assertPermission(role, 'sop:read');

  return c.json({
    ...sop,
    tagsJson: JSON.parse((sop.tags_json as string) || '[]'),
  });
});

/**
 * POST /sops/:id/interview/start — Start interview session
 */
sopRoutes.post('/:id/interview/start', async (c) => {
  const auth = getAuth(c);
  const sopId = c.req.param('id');

  const sop = await c.env.DB.prepare('SELECT * FROM sops WHERE id = ?')
    .bind(sopId)
    .first();
  if (!sop) return c.json({ error: { code: 'NOT_FOUND', message: 'SOP not found' } }, 404);

  const role = await getMembership(c.env.DB, sop.workspace_id as string, auth.userId);
  assertPermission(role, 'interview:start');

  // Check for existing active interview
  const existing = await c.env.DB.prepare(
    "SELECT id FROM interview_sessions WHERE sop_id = ? AND state = 'IN_PROGRESS'",
  )
    .bind(sopId)
    .first();
  if (existing) {
    return c.json(
      { error: { code: 'CONFLICT', message: 'An interview is already in progress for this SOP' } },
      409,
    );
  }

  const sessionId = crypto.randomUUID();
  const now = new Date().toISOString();
  const fsmState = createInterviewState(sessionId, sopId);
  const result = startInterview(fsmState);

  await c.env.DB.prepare(
    `INSERT INTO interview_sessions (id, sop_id, workspace_id, state, transcript_json, current_question_index, created_by_user_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, '[]', 0, ?, ?, ?)`,
  )
    .bind(sessionId, sopId, sop.workspace_id, 'IN_PROGRESS', auth.userId, now, now)
    .run();

  await writeAuditLog(c.env.DB, {
    workspaceId: sop.workspace_id as string,
    actorUserId: auth.userId,
    action: 'interview.started',
    entityType: 'interview_session',
    entityId: sessionId,
    meta: { sopId },
  });

  return c.json({
    sessionId,
    nextQuestion: result.nextQuestion,
  }, 201);
});

/**
 * POST /sops/:id/interview/answer — Answer current interview question
 */
sopRoutes.post('/:id/interview/answer', async (c) => {
  const auth = getAuth(c);
  const sopId = c.req.param('id');
  const body = await c.req.json();
  const parsed = InterviewAnswerSchema.parse(body);

  // Rate limit
  const rateResult = await checkRateLimit(c.env.DB, auth.userId, 'interviewAnswer');
  if (!rateResult.allowed) {
    return c.json({ error: { code: 'RATE_LIMITED', message: 'Too many answers per minute' } }, 429);
  }

  const sop = await c.env.DB.prepare('SELECT workspace_id FROM sops WHERE id = ?')
    .bind(sopId)
    .first<{ workspace_id: string }>();
  if (!sop) return c.json({ error: { code: 'NOT_FOUND', message: 'SOP not found' } }, 404);

  const role = await getMembership(c.env.DB, sop.workspace_id, auth.userId);
  assertPermission(role, 'interview:answer');

  // Get active session
  const session = await c.env.DB.prepare(
    "SELECT * FROM interview_sessions WHERE sop_id = ? AND state = 'IN_PROGRESS' ORDER BY created_at DESC LIMIT 1",
  )
    .bind(sopId)
    .first<{
      id: string;
      state: string;
      transcript_json: string;
      current_question_index: number;
    }>();

  if (!session) {
    return c.json(
      { error: { code: 'NOT_FOUND', message: 'No active interview session' } },
      404,
    );
  }

  // Reconstruct FSM state
  const transcript = JSON.parse(session.transcript_json);
  const fsmState = {
    sessionId: session.id,
    sopId,
    state: session.state as 'IN_PROGRESS',
    currentQuestionIndex: session.current_question_index,
    transcript,
  };

  const result = answerQuestion(fsmState, parsed.questionKey, parsed.answer);
  const now = new Date().toISOString();

  await c.env.DB.prepare(
    `UPDATE interview_sessions
     SET state = ?, transcript_json = ?, current_question_index = ?, updated_at = ?
     WHERE id = ?`,
  )
    .bind(
      result.newState.state,
      JSON.stringify(result.newState.transcript),
      result.newState.currentQuestionIndex,
      now,
      session.id,
    )
    .run();

  if (result.isComplete) {
    await writeAuditLog(c.env.DB, {
      workspaceId: sop.workspace_id,
      actorUserId: auth.userId,
      action: 'interview.completed',
      entityType: 'interview_session',
      entityId: session.id,
    });
    await incrementMetric(c.env.DB, sop.workspace_id, 'interviews_completed');
  }

  return c.json({
    nextQuestion: result.nextQuestion,
    isComplete: result.isComplete,
  });
});

/**
 * POST /sops/:id/generate — Enqueue LLM generation job
 */
sopRoutes.post('/:id/generate', async (c) => {
  const auth = getAuth(c);
  const sopId = c.req.param('id');

  // Rate limit generation
  const rateResult = await checkRateLimit(c.env.DB, auth.userId, 'generation');
  if (!rateResult.allowed) {
    return c.json({ error: { code: 'RATE_LIMITED', message: 'Too many generation requests' } }, 429);
  }

  const sop = await c.env.DB.prepare('SELECT * FROM sops WHERE id = ?')
    .bind(sopId)
    .first();
  if (!sop) return c.json({ error: { code: 'NOT_FOUND', message: 'SOP not found' } }, 404);

  const workspaceId = sop.workspace_id as string;
  const role = await getMembership(c.env.DB, workspaceId, auth.userId);
  assertPermission(role, 'generate:trigger');

  // Get completed interview session
  const session = await c.env.DB.prepare(
    "SELECT id FROM interview_sessions WHERE sop_id = ? AND state = 'COMPLETED' ORDER BY created_at DESC LIMIT 1",
  )
    .bind(sopId)
    .first<{ id: string }>();

  if (!session) {
    return c.json(
      { error: { code: 'BAD_REQUEST', message: 'No completed interview session found' } },
      400,
    );
  }

  // Check credits
  const workspace = await c.env.DB.prepare('SELECT plan, ai_config_json FROM workspaces WHERE id = ?')
    .bind(workspaceId)
    .first<{ plan: string; ai_config_json: string | null }>();

  const plan = (workspace?.plan ?? 'FREE') as Plan;

  if (plan !== 'FREE') {
    const credits = await hasCredits(c.env.DB, workspaceId);
    if (!credits) {
      return c.json(
        { error: { code: 'CREDITS_EXHAUSTED', message: 'No AI credits remaining. Purchase more or use BYO key.' } },
        402,
      );
    }
  }

  // Idempotency: check if already enqueued for this session
  const body = await c.req.json().catch(() => ({})) as { isDelta?: boolean; previousVersionId?: string };

  const dedup = await c.env.DB.prepare(
    `SELECT id FROM audit_logs
     WHERE workspace_id = ?
       AND action = 'version.created'
       AND entity_type = 'interview_session'
       AND entity_id = ?
     LIMIT 1`,
  )
    .bind(workspaceId, session.id)
    .first<{ id: string }>();

  if (dedup) {
    return c.json({ status: 'queued', deduplicated: true, sessionId: session.id }, 202);
  }

  // Enqueue job
  await c.env.QUEUE.send({
    type: 'llm_generation',
    sopId,
    workspaceId,
    interviewSessionId: session.id,
    userId: auth.userId,
    isDelta: body.isDelta ?? false,
    previousVersionId: body.previousVersionId,
  });

  await writeAuditLog(c.env.DB, {
    workspaceId,
    actorUserId: auth.userId,
    action: 'version.created',
    entityType: 'interview_session',
    entityId: session.id,
    meta: { sopId, queue: 'llm_generation' },
  });

  return c.json({ status: 'queued', sessionId: session.id }, 202);
});

/**
 * GET /sops/:id/versions — List versions
 */
sopRoutes.get('/:id/versions', async (c) => {
  const auth = getAuth(c);
  const sopId = c.req.param('id');

  const sop = await c.env.DB.prepare('SELECT workspace_id FROM sops WHERE id = ?')
    .bind(sopId)
    .first<{ workspace_id: string }>();
  if (!sop) return c.json({ error: { code: 'NOT_FOUND', message: 'SOP not found' } }, 404);

  const role = await getMembership(c.env.DB, sop.workspace_id, auth.userId);
  assertPermission(role, 'version:read');

  // Check entitlements for version history
  const workspace = await c.env.DB.prepare('SELECT plan FROM workspaces WHERE id = ?')
    .bind(sop.workspace_id)
    .first<{ plan: string }>();
  const plan = (workspace?.plan ?? 'FREE') as Plan;
  const entitlements = ENTITLEMENTS[plan];

  let limit = 100;
  if (!entitlements.fullVersionHistory) {
    limit = 5; // FREE plan: last 5 versions
  }

  const versions = await c.env.DB.prepare(
    'SELECT * FROM sop_versions WHERE sop_id = ? ORDER BY created_at DESC LIMIT ?',
  )
    .bind(sopId, limit)
    .all();

  return c.json({
    data: versions.results?.map((v: Record<string, unknown>) => ({
      ...v,
      contentJson: JSON.parse((v.content_json as string) || '{}'),
    })) ?? [],
  });
});

/**
 * POST /sops/:id/versions/:versionId/publish — Publish a version
 */
sopRoutes.post('/:id/versions/:versionId/publish', async (c) => {
  const auth = getAuth(c);
  const sopId = c.req.param('id');
  const versionId = c.req.param('versionId');

  const sop = await c.env.DB.prepare('SELECT * FROM sops WHERE id = ?')
    .bind(sopId)
    .first();
  if (!sop) return c.json({ error: { code: 'NOT_FOUND', message: 'SOP not found' } }, 404);

  const workspaceId = sop.workspace_id as string;
  const role = await getMembership(c.env.DB, workspaceId, auth.userId);
  assertPermission(role, 'sop:publish');

  // Check workspace policy
  const workspace = await c.env.DB.prepare('SELECT policy_json FROM workspaces WHERE id = ?')
    .bind(workspaceId)
    .first<{ policy_json: string }>();
  const policy = JSON.parse(workspace?.policy_json ?? '{}');

  if (policy.requireApprovalForPublish || policy.strictApprovals) {
    // Check for approved approval
    const approval = await c.env.DB.prepare(
      "SELECT id FROM approvals WHERE sop_id = ? AND version_id = ? AND state = 'APPROVED'",
    )
      .bind(sopId, versionId)
      .first();

    if (!approval) {
      return c.json(
        { error: { code: 'FORBIDDEN', message: 'Approval required before publishing (strict mode)' } },
        403,
      );
    }
  }

  // Supersede previous published version
  await c.env.DB.prepare(
    "UPDATE sops SET status = 'SUPERSEDED' WHERE workspace_id = ? AND status = 'PUBLISHED' AND id != ?",
  )
    .bind(workspaceId, sopId)
    .run();

  // Publish
  await c.env.DB.prepare(
    "UPDATE sops SET status = 'PUBLISHED', current_version_id = ? WHERE id = ?",
  )
    .bind(versionId, sopId)
    .run();

  await writeAuditLog(c.env.DB, {
    workspaceId,
    actorUserId: auth.userId,
    action: 'version.published',
    entityType: 'sop_version',
    entityId: versionId,
    meta: { sopId },
  });

  return c.json({ status: 'published', sopId, versionId });
});

/**
 * DELETE /sops/:id — Soft-delete (archive) a SOP
 */
sopRoutes.delete('/:id', async (c) => {
  const auth = getAuth(c);
  const sopId = c.req.param('id');

  const sop = await c.env.DB.prepare('SELECT workspace_id, status FROM sops WHERE id = ?')
    .bind(sopId)
    .first<{ workspace_id: string; status: string }>();

  if (!sop) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'SOP not found' } }, 404);
  }

  const role = await getMembership(c.env.DB, sop.workspace_id, auth.userId);
  assertPermission(role, 'sop:delete');

  if (sop.status === 'ARCHIVED') {
    return c.json({ error: { code: 'CONFLICT', message: 'SOP is already archived' } }, 409);
  }

  await c.env.DB.prepare("UPDATE sops SET status = 'ARCHIVED' WHERE id = ?")
    .bind(sopId)
    .run();

  await writeAuditLog(c.env.DB, {
    workspaceId: sop.workspace_id,
    actorUserId: auth.userId,
    action: 'sop.deleted',
    entityType: 'sop',
    entityId: sopId,
  });

  return c.json({ status: 'archived', sopId });
});

/**
 * POST /sops/:id/export — Trigger SOP export (HTML/PDF)
 */
sopRoutes.post('/:id/export', async (c) => {
  const auth = getAuth(c);
  const sopId = c.req.param('id');
  const body = await c.req.json<{ format?: string }>().catch(() => ({}));
  const format = (body as { format?: string }).format ?? 'html';

  if (format !== 'html' && format !== 'pdf') {
    return c.json({ error: { code: 'BAD_REQUEST', message: 'format must be "html" or "pdf"' } }, 400);
  }

  const sop = await c.env.DB.prepare(
    'SELECT workspace_id, current_version_id FROM sops WHERE id = ?',
  )
    .bind(sopId)
    .first<{ workspace_id: string; current_version_id: string | null }>();

  if (!sop) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'SOP not found' } }, 404);
  }

  const role = await getMembership(c.env.DB, sop.workspace_id, auth.userId);
  assertPermission(role, 'export:create');

  if (!sop.current_version_id) {
    return c.json(
      { error: { code: 'BAD_REQUEST', message: 'SOP has no published version to export' } },
      400,
    );
  }

  // Enqueue export job
  await c.env.QUEUE.send({
    type: 'export',
    sopId,
    versionId: sop.current_version_id,
    workspaceId: sop.workspace_id,
    format,
    requestedByUserId: auth.userId,
  });

  await writeAuditLog(c.env.DB, {
    workspaceId: sop.workspace_id,
    actorUserId: auth.userId,
    action: 'export.created',
    entityType: 'sop',
    entityId: sopId,
    meta: { format },
  });

  return c.json({ status: 'queued', sopId, format });
});
