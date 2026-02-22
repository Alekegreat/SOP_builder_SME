/**
 * Payment processing — idempotent webhook handlers.
 * Supports: Telegram Stars, TON Connect, Wallet Pay.
 */

/**
 * Idempotency check: returns true if this event was already processed
 */
export async function isPaymentProcessed(
  db: D1Database,
  provider: string,
  externalId: string,
): Promise<boolean> {
  const existing = await db
    .prepare('SELECT id FROM payment_events WHERE provider = ? AND external_id = ?')
    .bind(provider, externalId)
    .first();

  return !!existing;
}

/**
 * Record a payment event (idempotent — skips if already exists)
 */
export async function recordPaymentEvent(
  db: D1Database,
  event: {
    workspaceId: string;
    provider: string;
    status: string;
    externalId: string;
    amount: number;
    currency: string;
    rawJson: Record<string, unknown>;
  },
): Promise<{ created: boolean; id: string }> {
  // Check for duplicate
  const existing = await db
    .prepare('SELECT id FROM payment_events WHERE provider = ? AND external_id = ?')
    .bind(event.provider, event.externalId)
    .first<{ id: string }>();

  if (existing) {
    return { created: false, id: existing.id };
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO payment_events (id, workspace_id, provider, status, external_id, amount, currency, at, raw_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      event.workspaceId,
      event.provider,
      event.status,
      event.externalId,
      event.amount,
      event.currency,
      now,
      JSON.stringify(event.rawJson),
    )
    .run();

  return { created: true, id };
}

/**
 * Resolve workspace from Telegram user ID for Stars payments
 */
export async function resolveWorkspaceForUser(
  db: D1Database,
  telegramUserId: number,
): Promise<string | null> {
  const user = await db
    .prepare('SELECT id FROM users WHERE telegram_user_id = ?')
    .bind(telegramUserId)
    .first<{ id: string }>();

  if (!user) return null;

  const membership = await db
    .prepare(`SELECT workspace_id FROM memberships WHERE user_id = ? AND role = 'owner' LIMIT 1`)
    .bind(user.id)
    .first<{ workspace_id: string }>();

  return membership?.workspace_id ?? null;
}

/**
 * Validate Wallet Pay webhook signature
 */
export async function validateWalletPaySignature(
  body: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );

    const sigBytes = hexToBytes(signature);
    return await crypto.subtle.verify(
      'HMAC',
      key,
      sigBytes.buffer as ArrayBuffer,
      encoder.encode(body),
    );
  } catch {
    return false;
  }
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}
