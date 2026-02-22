import { ENTITLEMENTS, type Plan } from '@sop/shared';

/**
 * Get current period string (YYYYMM)
 */
export function getCurrentPeriod(now: Date = new Date()): string {
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Ensure usage_credits row exists for a workspace+period
 */
export async function ensureUsageCredits(
  db: D1Database,
  workspaceId: string,
  plan: Plan,
  period?: string,
): Promise<void> {
  const p = period ?? getCurrentPeriod();
  const entitlements = ENTITLEMENTS[plan];

  await db
    .prepare(
      `INSERT OR IGNORE INTO usage_credits (workspace_id, period_yyyymm, credits_included, credits_bought, credits_used)
       VALUES (?, ?, ?, 0, 0)`,
    )
    .bind(workspaceId, p, entitlements.aiCreditsPerMonth)
    .run();
}

/**
 * Check if workspace has remaining credits
 */
export async function hasCredits(
  db: D1Database,
  workspaceId: string,
  required: number = 1,
): Promise<boolean> {
  const period = getCurrentPeriod();
  const row = await db
    .prepare(
      `SELECT credits_included, credits_bought, credits_used
       FROM usage_credits WHERE workspace_id = ? AND period_yyyymm = ?`,
    )
    .bind(workspaceId, period)
    .first<{ credits_included: number; credits_bought: number; credits_used: number }>();

  if (!row) return false;
  return row.credits_included + row.credits_bought - row.credits_used >= required;
}

/**
 * Consume credits
 */
export async function consumeCredits(
  db: D1Database,
  workspaceId: string,
  amount: number = 1,
): Promise<boolean> {
  const period = getCurrentPeriod();

  const result = await db
    .prepare(
      `UPDATE usage_credits SET credits_used = credits_used + ?
       WHERE workspace_id = ? AND period_yyyymm = ?
       AND (credits_included + credits_bought - credits_used) >= ?`,
    )
    .bind(amount, workspaceId, period, amount)
    .run();

  return (result.meta?.changes ?? 0) > 0;
}

/**
 * Add purchased credits
 */
export async function addCredits(
  db: D1Database,
  workspaceId: string,
  credits: number,
): Promise<void> {
  const period = getCurrentPeriod();
  await db
    .prepare(
      `UPDATE usage_credits SET credits_bought = credits_bought + ?
       WHERE workspace_id = ? AND period_yyyymm = ?`,
    )
    .bind(credits, workspaceId, period)
    .run();
}

/**
 * Get billing info for a workspace
 */
export async function getBillingInfo(
  db: D1Database,
  workspaceId: string,
): Promise<{
  plan: Plan;
  creditsIncluded: number;
  creditsBought: number;
  creditsUsed: number;
  creditsRemaining: number;
  currentPeriod: string;
}> {
  const period = getCurrentPeriod();

  const workspace = await db
    .prepare('SELECT plan FROM workspaces WHERE id = ?')
    .bind(workspaceId)
    .first<{ plan: string }>();

  const plan = (workspace?.plan ?? 'FREE') as Plan;

  await ensureUsageCredits(db, workspaceId, plan, period);

  const credits = await db
    .prepare(
      `SELECT credits_included, credits_bought, credits_used
       FROM usage_credits WHERE workspace_id = ? AND period_yyyymm = ?`,
    )
    .bind(workspaceId, period)
    .first<{ credits_included: number; credits_bought: number; credits_used: number }>();

  const ci = credits?.credits_included ?? 0;
  const cb = credits?.credits_bought ?? 0;
  const cu = credits?.credits_used ?? 0;

  return {
    plan,
    creditsIncluded: ci,
    creditsBought: cb,
    creditsUsed: cu,
    creditsRemaining: Math.max(0, ci + cb - cu),
    currentPeriod: period,
  };
}

/**
 * Update workspace plan
 */
export async function updatePlan(
  db: D1Database,
  workspaceId: string,
  newPlan: Plan,
): Promise<void> {
  await db.prepare('UPDATE workspaces SET plan = ? WHERE id = ?').bind(newPlan, workspaceId).run();

  // Ensure credits for new plan
  await ensureUsageCredits(db, workspaceId, newPlan);
}

/**
 * Allowed metric column names — whitelist to prevent SQL injection
 * through column interpolation in incrementMetric.
 */
const ALLOWED_METRICS = new Set([
  'sops_created',
  'versions_created',
  'interviews_completed',
  'approvals_decided',
  'checklist_runs_completed',
  'credits_used',
]);

/**
 * Daily metrics increment
 */
export async function incrementMetric(
  db: D1Database,
  workspaceId: string,
  metric: string,
  amount: number = 1,
): Promise<void> {
  if (!ALLOWED_METRICS.has(metric)) {
    throw new Error(`Invalid metric name: ${metric}`);
  }

  const today = new Date().toISOString().substring(0, 10);

  await db
    .prepare(
      `INSERT INTO daily_metrics (workspace_id, date, ${metric})
       VALUES (?, ?, ?)
       ON CONFLICT (workspace_id, date)
       DO UPDATE SET ${metric} = ${metric} + ?`,
    )
    .bind(workspaceId, today, amount, amount)
    .run();
}
