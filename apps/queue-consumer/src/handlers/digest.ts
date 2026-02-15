import type { ConsumerEnv, QueueMessage } from '../index.js';

interface DigestJob extends QueueMessage {
  type: 'digest';
  workspaceId: string;
}

export async function handleDigest(job: QueueMessage, env: ConsumerEnv): Promise<void> {
  const data = job as DigestJob;
  const { workspaceId } = data;

  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Collect weekly stats
  const newSops = await env.DB.prepare(
    'SELECT COUNT(*) as cnt FROM sops WHERE workspace_id = ? AND created_at > ?',
  )
    .bind(workspaceId, oneWeekAgo)
    .first<{ cnt: number }>();

  const newVersions = await env.DB.prepare(
    `SELECT COUNT(*) as cnt FROM sop_versions sv
     JOIN sops s ON sv.sop_id = s.id
     WHERE s.workspace_id = ? AND sv.created_at > ?`,
  )
    .bind(workspaceId, oneWeekAgo)
    .first<{ cnt: number }>();

  const pendingApprovals = await env.DB.prepare(
    `SELECT COUNT(*) as cnt FROM approvals a
     JOIN sops s ON a.sop_id = s.id
     WHERE s.workspace_id = ? AND a.state = 'PENDING'`,
  )
    .bind(workspaceId)
    .first<{ cnt: number }>();

  const staleSops = await env.DB.prepare(
    `SELECT COUNT(*) as cnt FROM sops
     WHERE workspace_id = ? AND status = 'PUBLISHED'
     AND next_review_at < ?`,
  )
    .bind(workspaceId, new Date().toISOString())
    .first<{ cnt: number }>();

  // Get workspace owner(s) for notification
  const owners = await env.DB.prepare(
    `SELECT u.telegram_user_id FROM users u
     JOIN memberships m ON u.id = m.user_id
     WHERE m.workspace_id = ? AND m.role IN ('owner', 'admin')`,
  )
    .bind(workspaceId)
    .all();

  const digestMessage = [
    '📊 *Weekly SOP Digest*',
    '',
    `📝 New SOPs: ${newSops?.cnt ?? 0}`,
    `🔄 New versions: ${newVersions?.cnt ?? 0}`,
    `⏳ Pending approvals: ${pendingApprovals?.cnt ?? 0}`,
    `⚠️ Stale SOPs needing review: ${staleSops?.cnt ?? 0}`,
  ].join('\n');

  for (const owner of owners.results ?? []) {
    const tgId = owner.telegram_user_id as number;
    if (tgId) {
      await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: tgId,
          text: digestMessage,
          parse_mode: 'Markdown',
        }),
      });
    }
  }
}
