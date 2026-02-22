import { Hono } from 'hono';
import type { AppEnv } from '../app.js';
import { getAuth } from '../middleware/auth.js';
import { writeAuditLog } from '../services/audit.js';
import { incrementMetric } from '../services/billing.js';
import { CompleteChecklistRunSchema } from '@sop/shared';

export const checklistRoutes = new Hono<AppEnv>();

/**
 * POST /sops/:id/checklist_runs — Start a checklist run
 * Note: This is mounted on the sops router, but we also need a
 * /checklist_runs/:id/complete endpoint.
 */

/**
 * POST /checklist_runs/:id/complete — Complete a checklist run
 */
checklistRoutes.post('/:id/complete', async (c) => {
  const auth = getAuth(c);
  const runId = c.req.param('id');
  const body = await c.req.json();
  const parsed = CompleteChecklistRunSchema.parse(body);

  const run = await c.env.DB.prepare('SELECT * FROM checklist_runs WHERE id = ?')
    .bind(runId)
    .first();
  if (!run)
    return c.json({ error: { code: 'NOT_FOUND', message: 'Checklist run not found' } }, 404);

  if (run.user_id !== auth.userId) {
    return c.json(
      { error: { code: 'FORBIDDEN', message: 'Can only complete your own checklist run' } },
      403,
    );
  }

  if (run.completed_at) {
    return c.json({ error: { code: 'CONFLICT', message: 'Checklist run already completed' } }, 409);
  }

  const sop = await c.env.DB.prepare('SELECT workspace_id FROM sops WHERE id = ?')
    .bind(run.sop_id)
    .first<{ workspace_id: string }>();
  if (!sop) return c.json({ error: { code: 'NOT_FOUND', message: 'SOP not found' } }, 404);

  const now = new Date().toISOString();
  await c.env.DB.prepare('UPDATE checklist_runs SET completed_at = ?, items_json = ? WHERE id = ?')
    .bind(now, JSON.stringify(parsed.items), runId)
    .run();

  await writeAuditLog(c.env.DB, {
    workspaceId: sop.workspace_id,
    actorUserId: auth.userId,
    action: 'checklist.completed',
    entityType: 'checklist_run',
    entityId: runId,
  });

  await incrementMetric(c.env.DB, sop.workspace_id, 'checklist_runs_completed');

  return c.json({ id: runId, completedAt: now });
});
