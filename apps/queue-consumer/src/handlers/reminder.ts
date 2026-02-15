import type { ConsumerEnv, QueueMessage } from '../index.js';

interface ReminderJob extends QueueMessage {
  type: 'reminder';
  sopId: string;
  workspaceId: string;
  ownerUserId: string;
}

export async function handleReminder(job: QueueMessage, env: ConsumerEnv): Promise<void> {
  const data = job as ReminderJob;
  const { sopId, ownerUserId } = data;

  const sop = await env.DB.prepare('SELECT title, next_review_at FROM sops WHERE id = ?')
    .bind(sopId)
    .first<{ title: string; next_review_at: string }>();

  if (!sop) return;

  const user = await env.DB.prepare('SELECT telegram_user_id FROM users WHERE id = ?')
    .bind(ownerUserId)
    .first<{ telegram_user_id: number }>();

  if (!user?.telegram_user_id) return;

  await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: user.telegram_user_id,
      text: `🔔 *Review Reminder*\n\nSOP "${sop.title}" is due for review.\nReview date: ${sop.next_review_at}\n\nUse /update_sop to start a review interview.`,
      parse_mode: 'Markdown',
    }),
  });
}
