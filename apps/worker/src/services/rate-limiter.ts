import { RATE_LIMITS } from '@sop/shared';

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

type RateLimitCategory = keyof typeof RATE_LIMITS;

/**
 * Check rate limit using D1 storage.
 * Uses a sliding window approach with 1-minute windows.
 */
export async function checkRateLimit(
  db: D1Database,
  userId: string,
  category: RateLimitCategory,
): Promise<RateLimitResult> {
  const config = RATE_LIMITS[category];
  const key = `${category}:${userId}`;
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - 60; // 1-minute window

  // Get current count in window
  const result = await db
    .prepare('SELECT count, window_start FROM rate_limits WHERE key = ?')
    .bind(key)
    .first<{ count: number; window_start: number }>();

  if (!result || result.window_start < windowStart) {
    // New window or expired — reset
    await db
      .prepare('INSERT OR REPLACE INTO rate_limits (key, window_start, count) VALUES (?, ?, 1)')
      .bind(key, now)
      .run();

    return {
      allowed: true,
      remaining: config.maxPerMinute - 1,
      resetAt: now + 60,
    };
  }

  if (result.count >= config.maxPerMinute) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: result.window_start + 60,
    };
  }

  // Increment
  await db.prepare('UPDATE rate_limits SET count = count + 1 WHERE key = ?').bind(key).run();

  return {
    allowed: true,
    remaining: config.maxPerMinute - result.count - 1,
    resetAt: result.window_start + 60,
  };
}

/**
 * Clean up expired rate limit entries (call periodically)
 */
export async function cleanupRateLimits(db: D1Database): Promise<void> {
  const threshold = Math.floor(Date.now() / 1000) - 120; // 2 minutes ago
  await db.prepare('DELETE FROM rate_limits WHERE window_start < ?').bind(threshold).run();
}
