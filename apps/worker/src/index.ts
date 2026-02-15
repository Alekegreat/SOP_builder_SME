import app from './app.js';
import type { Env } from './env.js';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return app.fetch(request, env, ctx);
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(handleScheduled(event, env));
  },
};

/**
 * Cron trigger handler — runs daily digest and staleness checks
 */
async function handleScheduled(_event: ScheduledEvent, env: Env): Promise<void> {
  const now = new Date();
  const isoNow = now.toISOString();

  try {
    // Find SOPs that need review reminders
    const staleSops = await env.DB.prepare(
      `SELECT s.id, s.workspace_id, s.owner_user_id, s.title, s.next_review_at
       FROM sops s
       WHERE s.status = 'PUBLISHED'
       AND s.next_review_at IS NOT NULL
       AND s.next_review_at < ?`,
    )
      .bind(isoNow)
      .all();

    for (const sop of staleSops.results ?? []) {
      // Enqueue reminder job
      await env.QUEUE.send({
        type: 'reminder',
        sopId: sop.id as string,
        workspaceId: sop.workspace_id as string,
        ownerUserId: sop.owner_user_id as string,
      });
    }

    // Weekly digest (run on Mondays)
    if (now.getDay() === 1) {
      const workspaces = await env.DB.prepare('SELECT id FROM workspaces').all();
      for (const ws of workspaces.results ?? []) {
        await env.QUEUE.send({
          type: 'digest',
          workspaceId: ws.id as string,
        });
      }
    }

    // Cleanup expired rate limits
    const threshold = Math.floor(Date.now() / 1000) - 120;
    await env.DB.prepare('DELETE FROM rate_limits WHERE window_start < ?')
      .bind(threshold)
      .run();
  } catch (err) {
    console.error('Scheduled job error:', err);
  }
}
