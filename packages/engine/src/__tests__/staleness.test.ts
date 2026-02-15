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
      const result = calculateStaleness(
        now.toISOString(),
        90,
        now
      );
      expect(result.level).toBe('fresh');
      expect(result.score).toBeLessThan(0.5);
    });

    it('returns aging for SOPs past 50% of cycle', () => {
      const now = new Date();
      const fiftyDaysAgo = new Date(now.getTime() - 50 * 24 * 60 * 60 * 1000);
      const result = calculateStaleness(
        fiftyDaysAgo.toISOString(),
        90,
        now
      );
      expect(result.level).toBe('aging');
    });

    it('returns stale for SOPs past 80% of cycle', () => {
      const now = new Date();
      const sevtyFiveDaysAgo = new Date(now.getTime() - 75 * 24 * 60 * 60 * 1000);
      const result = calculateStaleness(
        sevtyFiveDaysAgo.toISOString(),
        90,
        now
      );
      expect(result.level).toBe('stale');
    });

    it('returns overdue for SOPs past cycle', () => {
      const now = new Date();
      const hundredDaysAgo = new Date(now.getTime() - 100 * 24 * 60 * 60 * 1000);
      const result = calculateStaleness(
        hundredDaysAgo.toISOString(),
        90,
        now
      );
      expect(result.level).toBe('overdue');
      expect(result.score).toBeGreaterThan(1);
    });
  });

  describe('calculateNextReviewDate', () => {
    it('returns date cycleDays after creation', () => {
      const created = new Date('2024-01-15');
      const next = calculateNextReviewDate(created.toISOString(), 90);
      expect(new Date(next).getTime()).toBe(
        new Date('2024-04-14').getTime(),
      );
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
        { id: '2', lastVersionCreatedAt: new Date(now.getTime() - 80 * 24 * 60 * 60 * 1000).toISOString(), reviewCycleDays: 90 }, // stale
        { id: '3', lastVersionCreatedAt: new Date(now.getTime() - 100 * 24 * 60 * 60 * 1000).toISOString(), reviewCycleDays: 90 }, // overdue
      ];

      const stale = filterStaleSOPs(sops, now);
      expect(stale.length).toBeGreaterThanOrEqual(1);
      // Items 2 and 3 should be flagged
      expect(stale.some(s => s.id === '2')).toBe(true);
      expect(stale.some(s => s.id === '3')).toBe(true);
      expect(stale.some(s => s.id === '1')).toBe(false);
    });
  });
});
