import { describe, it, expect, vi } from 'vitest';
import {
  isPaymentProcessed,
  recordPaymentEvent,
  validateWalletPaySignature,
} from '../../apps/worker/src/services/payments.js';

describe('Security regression: payment idempotency', () => {
  it('deduplicates by provider + external id', async () => {
    const db = {
      prepare: () => ({
        bind: () => ({
          first: async () => ({ id: 'evt-1' }),
        }),
      }),
    } as unknown as D1Database;

    const deduped = await isPaymentProcessed(db, 'walletpay', 'external-123');
    expect(deduped).toBe(true);
  });

  it('returns false for unknown events', async () => {
    const db = {
      prepare: () => ({
        bind: () => ({
          first: async () => null,
        }),
      }),
    } as unknown as D1Database;

    const exists = await isPaymentProcessed(db, 'stars', 'nonexistent-123');
    expect(exists).toBe(false);
  });

  it('recordPaymentEvent creates new event on first call', async () => {
    const runFn = vi.fn().mockResolvedValue({});
    const db = {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(null), // not a duplicate
          run: runFn,
        }),
      }),
    } as unknown as D1Database;

    const result = await recordPaymentEvent(db, {
      workspaceId: 'ws-1',
      provider: 'stars',
      status: 'completed',
      externalId: 'stars-charge-123',
      amount: 500,
      currency: 'XTR',
      rawJson: { test: true },
    });

    expect(result.created).toBe(true);
    expect(result.id).toBeDefined();
  });

  it('recordPaymentEvent deduplicates on second call', async () => {
    const db = {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({ id: 'existing-evt-1' }), // already exists
          run: vi.fn(),
        }),
      }),
    } as unknown as D1Database;

    const result = await recordPaymentEvent(db, {
      workspaceId: 'ws-1',
      provider: 'stars',
      status: 'completed',
      externalId: 'stars-charge-123',
      amount: 500,
      currency: 'XTR',
      rawJson: { test: true },
    });

    expect(result.created).toBe(false);
    expect(result.id).toBe('existing-evt-1');
  });

  it('different providers with same external_id are independent', async () => {
    // stars:ext-1 exists, walletpay:ext-1 does not
    const db = {
      prepare: vi.fn().mockImplementation(() => ({
        bind: vi.fn().mockImplementation((...args: unknown[]) => ({
          first: vi.fn().mockImplementation(async () => {
            if (args[0] === 'stars') return { id: 'evt-stars' };
            return null;
          }),
          run: vi.fn().mockResolvedValue({}),
        })),
      })),
    } as unknown as D1Database;

    expect(await isPaymentProcessed(db, 'stars', 'ext-1')).toBe(true);
    expect(await isPaymentProcessed(db, 'walletpay', 'ext-1')).toBe(false);
  });

  it('validateWalletPaySignature rejects invalid signatures', async () => {
    const result = await validateWalletPaySignature('body', 'invalid', 'secret');
    expect(result).toBe(false);
  });

  it('validateWalletPaySignature rejects malformed hex', async () => {
    const result = await validateWalletPaySignature('body', 'not-hex-at-all!', 'secret');
    expect(result).toBe(false);
  });
});
