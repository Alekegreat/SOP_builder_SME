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

describe('Rate Limiter Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  describe('checkRateLimit', () => {
    it('allows request within limit', async () => {
      const { checkRateLimit } = await import('../rate-limiter.js');

      mockD1.first.mockResolvedValue({ count: 0 });
      mockD1.run.mockResolvedValue({});

      const result = await checkRateLimit(mockD1 as any, 'user:123', {
        maxRequests: 10,
        windowMs: 60_000,
      });

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(10);
    });

    it('blocks request over limit', async () => {
      const { checkRateLimit } = await import('../rate-limiter.js');

      mockD1.first.mockResolvedValue({ count: 10 });

      const result = await checkRateLimit(mockD1 as any, 'user:123', {
        maxRequests: 10,
        windowMs: 60_000,
      });

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('returns correct remaining count', async () => {
      const { checkRateLimit } = await import('../rate-limiter.js');

      mockD1.first.mockResolvedValue({ count: 7 });

      const result = await checkRateLimit(mockD1 as any, 'user:123', {
        maxRequests: 10,
        windowMs: 60_000,
      });

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(3);
    });
  });

  describe('cleanupExpiredEntries', () => {
    it('deletes old entries', async () => {
      const { cleanupExpiredEntries } = await import('../rate-limiter.js');

      mockD1.run.mockResolvedValue({ meta: { changes: 5 } });

      await cleanupExpiredEntries(mockD1 as any);

      expect(mockD1.prepare).toHaveBeenCalled();
      expect(mockD1.run).toHaveBeenCalled();
    });
  });
});
