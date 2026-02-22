import type { AuditAction } from '@sop/shared';

/**
 * Write a structured audit log entry.
 */
export async function writeAuditLog(
  db: D1Database,
  entry: {
    workspaceId: string;
    actorUserId: string;
    action: AuditAction;
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
      entry.workspaceId,
      entry.actorUserId,
      entry.action,
      entry.entityType,
      entry.entityId,
      entry.meta ? JSON.stringify(entry.meta) : null,
      now,
    )
    .run();
}

/**
 * Query audit logs with pagination and optional filters
 */
export async function queryAuditLogs(
  db: D1Database,
  workspaceId: string,
  options: {
    limit?: number;
    offset?: number;
    action?: string;
    entityType?: string;
  } = {},
): Promise<{ logs: AuditLogRow[]; total: number }> {
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;

  let whereClause = 'WHERE workspace_id = ?';
  const params: unknown[] = [workspaceId];

  if (options.action) {
    whereClause += ' AND action = ?';
    params.push(options.action);
  }
  if (options.entityType) {
    whereClause += ' AND entity_type = ?';
    params.push(options.entityType);
  }

  const countResult = await db
    .prepare(`SELECT COUNT(*) as total FROM audit_logs ${whereClause}`)
    .bind(...params)
    .first<{ total: number }>();

  const logs = await db
    .prepare(`SELECT * FROM audit_logs ${whereClause} ORDER BY at DESC LIMIT ? OFFSET ?`)
    .bind(...params, limit, offset)
    .all<AuditLogRow>();

  return {
    logs: logs.results ?? [],
    total: countResult?.total ?? 0,
  };
}

export interface AuditLogRow {
  id: string;
  workspace_id: string;
  actor_user_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  meta_json: string | null;
  at: string;
}
