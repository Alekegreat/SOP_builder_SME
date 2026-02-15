/**
 * Queue consumer's audit log writer (subset).
 */

export async function writeAuditLog(
  db: D1Database,
  params: {
    workspaceId: string;
    actorUserId: string;
    action: string;
    entityType: string;
    entityId: string;
    meta?: Record<string, unknown>;
  },
): Promise<void> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO audit_logs (id, workspace_id, actor_user_id, action, entity_type, entity_id, meta_json, at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      params.workspaceId,
      params.actorUserId,
      params.action,
      params.entityType,
      params.entityId,
      params.meta ? JSON.stringify(params.meta) : null,
      now,
    )
    .run();
}
