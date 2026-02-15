import { describe, it, expect } from 'vitest';
import { isPaymentProcessed } from '../../apps/worker/src/services/payments.js';

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
});
