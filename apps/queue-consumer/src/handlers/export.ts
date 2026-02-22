import type { ConsumerEnv, QueueMessage } from '../index.js';
import { renderSopToHtml } from '@sop/engine';
import type { SopContent } from '@sop/shared';
import { writeAuditLog } from '../services/audit.js';

interface ExportJob extends QueueMessage {
  type: 'export';
  sopId: string;
  versionId: string;
  workspaceId: string;
  userId: string;
  format: 'html' | 'pdf';
}

export async function handleExport(job: QueueMessage, env: ConsumerEnv): Promise<void> {
  const data = job as ExportJob;
  const { sopId, versionId, workspaceId, userId, format } = data;

  const workspace = await env.DB.prepare('SELECT plan FROM workspaces WHERE id = ?')
    .bind(workspaceId)
    .first<{ plan: string }>();
  const isFreePlan = workspace?.plan === 'FREE';

  // Get version content
  const version = await env.DB.prepare(
    'SELECT content_json, semver, created_at, created_by_user_id FROM sop_versions WHERE id = ?',
  )
    .bind(versionId)
    .first<{
      content_json: string;
      semver: string;
      created_at: string;
      created_by_user_id: string;
    }>();

  if (!version) {
    throw new Error(`Version not found: ${versionId}`);
  }

  const sop = await env.DB.prepare('SELECT title FROM sops WHERE id = ?')
    .bind(sopId)
    .first<{ title: string }>();

  const author = await env.DB.prepare('SELECT name FROM users WHERE id = ?')
    .bind(version.created_by_user_id)
    .first<{ name: string }>();

  const content = JSON.parse(version.content_json) as SopContent;
  let fileContent: string;
  let contentType: string;
  let extension: string;

  switch (format) {
    case 'html':
      fileContent = renderSopToHtml(content, {
        title: sop?.title ?? 'SOP',
        version: version.semver,
        author: author?.name ?? 'Unknown',
        createdAt: version.created_at,
        watermark: isFreePlan,
      });
      contentType = 'text/html';
      extension = 'html';
      break;
    case 'pdf':
      fileContent = renderSopToHtml(content, {
        title: sop?.title ?? 'SOP',
        version: version.semver,
        author: author?.name ?? 'Unknown',
        createdAt: version.created_at,
        watermark: isFreePlan,
      });
      contentType = 'application/pdf';
      extension = 'pdf';
      break;
    default:
      throw new Error(`Unsupported export format: ${format}`);
  }

  // Store in R2
  const key = `exports/${workspaceId}/${sopId}/${versionId}.${extension}`;
  await env.R2.put(key, fileContent, {
    httpMetadata: { contentType },
    customMetadata: {
      sopId,
      versionId,
      workspaceId,
      format,
      exportedBy: userId,
      exportedAt: new Date().toISOString(),
    },
  });

  // Record in attachments table
  await env.DB.prepare(
    `INSERT INTO attachments (id, workspace_id, entity_type, entity_id, r2_key, mime, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      workspaceId,
      'sop_version_export',
      versionId,
      key,
      contentType,
      new Date().toISOString(),
    )
    .run();

  await writeAuditLog(env.DB, {
    workspaceId,
    actorUserId: userId,
    action: 'export.created',
    entityType: 'attachment',
    entityId: key,
    meta: { sopId, versionId, format },
  });

  // Notify user
  const user = await env.DB.prepare('SELECT telegram_user_id FROM users WHERE id = ?')
    .bind(userId)
    .first<{ telegram_user_id: number }>();

  if (user) {
    await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: user.telegram_user_id,
        text: `📄 Your SOP export is ready (${format.toUpperCase()}).\nOpen the app to download.`,
      }),
    });
  }
}
