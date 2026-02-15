import { STALENESS_THRESHOLDS, DEFAULT_REVIEW_CYCLE_DAYS } from '@sop/shared';

export type StalenessLevel = 'fresh' | 'aging' | 'stale' | 'overdue';

export interface StalenessResult {
  level: StalenessLevel;
  score: number; // 0.0 to 1.0+ (can exceed 1.0 if overdue)
  daysUntilReview: number;
  daysSinceLastVersion: number;
  reviewCycleDays: number;
}

/**
 * Calculate staleness score for an SOP.
 *
 * @param lastVersionCreatedAt - ISO timestamp of the last version
 * @param reviewCycleDays - Number of days in the review cycle
 * @param now - Current date (for testability)
 */
export function calculateStaleness(
  lastVersionCreatedAt: string,
  reviewCycleDays: number = DEFAULT_REVIEW_CYCLE_DAYS,
  now: Date = new Date(),
): StalenessResult {
  const lastVersionDate = new Date(lastVersionCreatedAt);
  const elapsed = now.getTime() - lastVersionDate.getTime();
  const daysSinceLastVersion = Math.floor(elapsed / (1000 * 60 * 60 * 24));
  const daysUntilReview = reviewCycleDays - daysSinceLastVersion;

  // Score: 0.0 = just created, 1.0 = due for review, >1.0 = overdue
  const score = daysSinceLastVersion / reviewCycleDays;

  let level: StalenessLevel;
  if (score >= STALENESS_THRESHOLDS.overdue) {
    level = 'overdue';
  } else if (score >= STALENESS_THRESHOLDS.stale) {
    level = 'stale';
  } else if (score >= STALENESS_THRESHOLDS.aging) {
    level = 'aging';
  } else {
    level = 'fresh';
  }

  return {
    level,
    score: Math.round(score * 100) / 100,
    daysUntilReview: Math.max(0, daysUntilReview),
    daysSinceLastVersion,
    reviewCycleDays,
  };
}

/**
 * Calculate next review date based on review cycle
 */
export function calculateNextReviewDate(
  fromDate: string | Date,
  reviewCycleDays: number = DEFAULT_REVIEW_CYCLE_DAYS,
): Date {
  const date = typeof fromDate === 'string' ? new Date(fromDate) : fromDate;
  return new Date(date.getTime() + reviewCycleDays * 24 * 60 * 60 * 1000);
}

/**
 * Determine if an SOP needs a review reminder
 */
export function needsReminder(staleness: StalenessResult): boolean {
  return staleness.level === 'stale' || staleness.level === 'overdue';
}

/**
 * Get SOPs that need reminders from a batch
 */
export function filterStaleSOPs<T extends { lastVersionCreatedAt: string; reviewCycleDays?: number }>(
  sops: T[],
  now: Date = new Date(),
): Array<T & { staleness: StalenessResult }> {
  return sops
    .map((sop) => ({
      ...sop,
      staleness: calculateStaleness(
        sop.lastVersionCreatedAt,
        sop.reviewCycleDays ?? DEFAULT_REVIEW_CYCLE_DAYS,
        now,
      ),
    }))
    .filter((sop) => needsReminder(sop.staleness));
}
