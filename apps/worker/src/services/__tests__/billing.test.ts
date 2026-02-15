// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';

// D1 mock
const mockD1 = {
  prepare: vi.fn().mockReturnThis(),
  bind: vi.fn().mockReturnThis(),
  first: vi.fn(),
  run: vi.fn(),
  all: vi.fn(),
};

describe('Billing Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  describe('getCurrentPeriod', () => {
    it('returns current billing period', async () => {
      const { getCurrentPeriod } = await import('../billing.js');

      const period = getCurrentPeriod();

      expect(period).toHaveProperty('start');
      expect(period).toHaveProperty('end');
      expect(new Date(period.start).getTime()).toBeLessThan(new Date(period.end).getTime());
    });

    it('period is month-long', async () => {
      const { getCurrentPeriod } = await import('../billing.js');

      const period = getCurrentPeriod();
      const start = new Date(period.start);
      const end = new Date(period.end);

      // Approximately 28-31 days
      const days = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
      expect(days).toBeGreaterThanOrEqual(28);
      expect(days).toBeLessThanOrEqual(32);
    });
  });

  describe('hasCredits', () => {
    it('returns true when credits available', async () => {
      const { hasCredits } = await import('../billing.js');

      mockD1.first.mockResolvedValue({ remaining: 10 });

      const result = await hasCredits(mockD1 as any, 'ws-1');
      expect(result).toBe(true);
    });

    it('returns false when no credits', async () => {
      const { hasCredits } = await import('../billing.js');

      mockD1.first.mockResolvedValue({ remaining: 0 });

      const result = await hasCredits(mockD1 as any, 'ws-1');
      expect(result).toBe(false);
    });

    it('returns false when no record', async () => {
      const { hasCredits } = await import('../billing.js');

      mockD1.first.mockResolvedValue(null);

      const result = await hasCredits(mockD1 as any, 'ws-1');
      expect(result).toBe(false);
    });
  });

  describe('consumeCredits', () => {
    it('decrements credit count', async () => {
      const { consumeCredits } = await import('../billing.js');

      mockD1.run.mockResolvedValue({ meta: { changes: 1 } });

      await consumeCredits(mockD1 as any, 'ws-1', 1);

      expect(mockD1.prepare).toHaveBeenCalled();
      expect(mockD1.bind).toHaveBeenCalled();
    });

    it('consumes multiple credits', async () => {
      const { consumeCredits } = await import('../billing.js');

      mockD1.run.mockResolvedValue({ meta: { changes: 1 } });

      await consumeCredits(mockD1 as any, 'ws-1', 5);

      expect(mockD1.bind).toHaveBeenCalledWith(expect.anything(), expect.anything(), 5);
    });
  });

  describe('getBillingInfo', () => {
    it('returns billing info for workspace', async () => {
      const { getBillingInfo } = await import('../billing.js');

      mockD1.first.mockResolvedValue({
        plan: 'SOLO_PRO',
        creditsUsed: 3,
        creditsTotal: 30,
        periodStart: '2025-01-01',
        periodEnd: '2025-01-31',
      });

      const info = await getBillingInfo(mockD1 as any, 'ws-1');
      expect(info).toHaveProperty('plan');
      expect(info.plan).toBe('SOLO_PRO');
    });
  });
});
