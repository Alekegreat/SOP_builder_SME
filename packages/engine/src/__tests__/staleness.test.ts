// @ts-nocheck
import { describe, it, expect } from 'vitest';
import {
  calculateStaleness,
  calculateNextReviewDate,
  needsReminder,
  filterStaleSOPs,
} from '@sop/engine';

describe('Staleness', () => {
  describe('calculateStaleness', () => {
    it('returns fresh for recently created SOPs', () => {
      const now = new Date();
      const result = calculateStaleness(now.toISOString(), 90, now);
      expect(result.level).toBe('fresh');
      expect(result.score).toBeLessThan(0.5);
    });

    it('returns aging for SOPs past 50% of cycle', () => {
      const now = new Date();
      const fiftyDaysAgo = new Date(now.getTime() - 50 * 24 * 60 * 60 * 1000);
      const result = calculateStaleness(fiftyDaysAgo.toISOString(), 90, now);
      expect(result.level).toBe('aging');
    });

    it('returns stale for SOPs past 80% of cycle', () => {
      const now = new Date();
      const sevtyFiveDaysAgo = new Date(now.getTime() - 75 * 24 * 60 * 60 * 1000);
      const result = calculateStaleness(sevtyFiveDaysAgo.toISOString(), 90, now);
      expect(result.level).toBe('stale');
    });

    it('returns overdue for SOPs past cycle', () => {
      const now = new Date();
      const hundredDaysAgo = new Date(now.getTime() - 100 * 24 * 60 * 60 * 1000);
      const result = calculateStaleness(hundredDaysAgo.toISOString(), 90, now);
      expect(result.level).toBe('overdue');
      expect(result.score).toBeGreaterThan(1);
      expect(result.daysUntilReview).toBe(0); // max(0, negative) = 0
    });

    it('uses default review cycle days when not provided', () => {
      const now = new Date();
      const result = calculateStaleness(now.toISOString());
      expect(result.reviewCycleDays).toBe(90);
      expect(result.level).toBe('fresh');
    });

    it('returns daysUntilReview as 0 when overdue', () => {
      const now = new Date();
      const longAgo = new Date(now.getTime() - 200 * 24 * 60 * 60 * 1000);
      const result = calculateStaleness(longAgo.toISOString(), 90, now);
      expect(result.daysUntilReview).toBe(0);
      expect(result.daysSinceLastVersion).toBeGreaterThan(90);
    });
  });

  describe('calculateNextReviewDate', () => {
    it('returns date cycleDays after creation', () => {
      const created = new Date('2024-01-15');
      const next = calculateNextReviewDate(created.toISOString(), 90);
      expect(new Date(next).getTime()).toBe(new Date('2024-04-14').getTime());
    });
  });

  describe('needsReminder', () => {
    it('returns true when stale or overdue', () => {
      expect(needsReminder({ level: 'stale' } as any)).toBe(true);
      expect(needsReminder({ level: 'overdue' } as any)).toBe(true);
    });

    it('returns false when fresh or aging', () => {
      expect(needsReminder({ level: 'fresh' } as any)).toBe(false);
      expect(needsReminder({ level: 'aging' } as any)).toBe(false);
    });
  });

  describe('filterStaleSOPs', () => {
    it('returns SOPs with staleness above threshold', () => {
      const now = new Date();
      const sops = [
        { id: '1', lastVersionCreatedAt: now.toISOString(), reviewCycleDays: 90 },
        {
          id: '2',
          lastVersionCreatedAt: new Date(now.getTime() - 80 * 24 * 60 * 60 * 1000).toISOString(),
          reviewCycleDays: 90,
        }, // stale
        {
          id: '3',
          lastVersionCreatedAt: new Date(now.getTime() - 100 * 24 * 60 * 60 * 1000).toISOString(),
          reviewCycleDays: 90,
        }, // overdue
      ];

      const stale = filterStaleSOPs(sops, now);
      expect(stale.length).toBeGreaterThanOrEqual(1);
      // Items 2 and 3 should be flagged
      expect(stale.some((s) => s.id === '2')).toBe(true);
      expect(stale.some((s) => s.id === '3')).toBe(true);
      expect(stale.some((s) => s.id === '1')).toBe(false);
    });

    it('uses default reviewCycleDays when not specified on SOP', () => {
      const now = new Date();
      const sops = [
        {
          id: '1',
          lastVersionCreatedAt: new Date(now.getTime() - 80 * 24 * 60 * 60 * 1000).toISOString(),
        },
        { id: '2', lastVersionCreatedAt: now.toISOString() },
      ];

      const stale = filterStaleSOPs(sops, now);
      // id=1 at 80 days into default 90-day cycle should be stale (88%)
      expect(stale.some((s) => s.id === '1')).toBe(true);
      expect(stale.some((s) => s.id === '2')).toBe(false);
    });

    it('returns empty array when no SOPs are stale', () => {
      const now = new Date();
      const sops = [
        { id: '1', lastVersionCreatedAt: now.toISOString(), reviewCycleDays: 90 },
        {
          id: '2',
          lastVersionCreatedAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(),
          reviewCycleDays: 90,
        },
      ];

      const stale = filterStaleSOPs(sops, now);
      expect(stale).toHaveLength(0);
    });

    it('enriches results with staleness data', () => {
      const now = new Date();
      const sops = [
        {
          id: '1',
          lastVersionCreatedAt: new Date(now.getTime() - 100 * 24 * 60 * 60 * 1000).toISOString(),
          reviewCycleDays: 90,
        },
      ];

      const stale = filterStaleSOPs(sops, now);
      expect(stale[0].staleness).toBeDefined();
      expect(stale[0].staleness.level).toBe('overdue');
      expect(stale[0].staleness.score).toBeGreaterThan(1);
    });
  });
});
