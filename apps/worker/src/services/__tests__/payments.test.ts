// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockD1 = {
  prepare: vi.fn().mockReturnThis(),
  bind: vi.fn().mockReturnThis(),
  first: vi.fn(),
  run: vi.fn(),
  all: vi.fn(),
};

describe('Payments Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isPaymentProcessed', () => {
    it('returns false for new payment', async () => {
      const { isPaymentProcessed } = await import('../payments.js');

      mockD1.first.mockResolvedValue(null);

      const result = await isPaymentProcessed(mockD1 as any, 'pay-123');
      expect(result).toBe(false);
    });

    it('returns true for duplicate payment', async () => {
      const { isPaymentProcessed } = await import('../payments.js');

      mockD1.first.mockResolvedValue({ id: 'existing' });

      const result = await isPaymentProcessed(mockD1 as any, 'pay-123');
      expect(result).toBe(true);
    });
  });

  describe('recordPaymentEvent', () => {
    it('inserts payment event', async () => {
      const { recordPaymentEvent } = await import('../payments.js');

      mockD1.run.mockResolvedValue({});

      await recordPaymentEvent(mockD1 as any, {
        id: 'pay-123',
        method: 'telegram_stars',
        workspaceId: 'ws-1',
        amount: 1200,
        currency: 'XTR',
        status: 'completed',
        rawPayload: '{}',
      });

      expect(mockD1.prepare).toHaveBeenCalled();
      expect(mockD1.run).toHaveBeenCalled();
    });
  });

  describe('resolveWorkspaceForUser', () => {
    it('resolves workspace from user id', async () => {
      const { resolveWorkspaceForUser } = await import('../payments.js');

      mockD1.first.mockResolvedValue({ workspaceId: 'ws-1' });

      const wsId = await resolveWorkspaceForUser(mockD1 as any, 'user-123');
      expect(wsId).toBe('ws-1');
    });

    it('returns null if no workspace', async () => {
      const { resolveWorkspaceForUser } = await import('../payments.js');

      mockD1.first.mockResolvedValue(null);

      const wsId = await resolveWorkspaceForUser(mockD1 as any, 'user-unknown');
      expect(wsId).toBeNull();
    });
  });
});
