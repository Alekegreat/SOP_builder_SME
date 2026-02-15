/**
 * Queue consumer's billing helpers (subset).
 */

export async function consumeCredits(
  db: D1Database,
  workspaceId: string,
  amount: number,
): Promise<void> {
  const period = getCurrentPeriod();
  await db
    .prepare(
      'UPDATE usage_credits SET credits_used = credits_used + ? WHERE workspace_id = ? AND period_yyyymm = ?',
    )
    .bind(amount, workspaceId, period)
    .run();
}

function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
}
