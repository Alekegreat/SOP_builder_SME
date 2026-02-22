// @ts-nocheck
import { describe, it, expect, vi } from 'vitest';
import app from '../../apps/worker/src/app.js';

// ── D1 Mock Factory ──
function createMockD1() {
  const mock: Record<string, ReturnType<typeof vi.fn>> = {
    first: vi.fn().mockResolvedValue(null),
    run: vi.fn().mockResolvedValue({ meta: {} }),
    all: vi.fn().mockResolvedValue({ results: [] }),
    batch: vi.fn().mockResolvedValue([]),
  };
  mock.prepare = vi.fn().mockReturnValue(mock);
  mock.bind = vi.fn().mockReturnValue(mock);
  return mock;
}

function createTestEnv(d1Override?: Record<string, unknown>) {
  return {
    DB: d1Override ?? createMockD1(),
    BUCKET: { put: vi.fn(), get: vi.fn(), delete: vi.fn() },
    QUEUE: { send: vi.fn().mockResolvedValue(undefined) },
    BOT_TOKEN: 'test-bot-token',
    JWT_SECRET: 'test-jwt-secret-key-that-is-long-enough-32chars!!',
    ENCRYPTION_KEY: '0'.repeat(64),
    TELEGRAM_BOT_TOKEN: 'test:bot-token',
    FEATURE_TON_VERIFICATION: 'false',
    FEATURE_WALLETPAY: 'false',
    FEATURE_PDF_EXPORT: 'false',
  };
}

// Helper: generate a fake JWT for auth (simplified — skips real signing)
function _createFakeAuthHeader() {
  // Base64url encode a JWT-like token that the auth middleware can parse
  // In integration tests, we mock the verify function
  return 'Bearer fake-jwt-token';
}

// ── Tests ──

describe('Health Check', () => {
  it('GET /health returns 200 with status ok', async () => {
    const res = await app.request('/health', {}, createTestEnv());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeDefined();
  });
});

describe('Auth Routes', () => {
  it('POST /auth/telegram rejects empty body', async () => {
    const res = await app.request(
      '/auth/telegram',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      },
      createTestEnv(),
    );

    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('POST /auth/telegram rejects invalid initData', async () => {
    const res = await app.request(
      '/auth/telegram',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData: 'invalid-data' }),
      },
      createTestEnv(),
    );

    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe('SOP Routes (Unauthenticated)', () => {
  it('GET /sops returns 401 without auth header', async () => {
    const res = await app.request('/sops', {}, createTestEnv());
    expect(res.status).toBe(401);
  });

  it('POST /sops returns 401 without auth header', async () => {
    const res = await app.request(
      '/sops',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Test', workspaceId: 'ws-1' }),
      },
      createTestEnv(),
    );
    expect(res.status).toBe(401);
  });

  it('DELETE /sops/some-id returns 401 without auth header', async () => {
    const res = await app.request(
      '/sops/some-id',
      {
        method: 'DELETE',
      },
      createTestEnv(),
    );
    expect(res.status).toBe(401);
  });
});

describe('Approval Routes (Unauthenticated)', () => {
  it('GET /approvals/inbox returns 401 without auth', async () => {
    const res = await app.request('/approvals/inbox', {}, createTestEnv());
    expect(res.status).toBe(401);
  });
});

describe('Admin Routes (Unauthenticated)', () => {
  it('GET /admin/audit_logs returns 401 without auth', async () => {
    const res = await app.request('/admin/audit_logs', {}, createTestEnv());
    expect(res.status).toBe(401);
  });
});

describe('Workspace Routes (Unauthenticated)', () => {
  it('GET /workspace/settings returns 401 without auth', async () => {
    const res = await app.request('/workspace/settings', {}, createTestEnv());
    expect(res.status).toBe(401);
  });

  it('GET /workspace/members returns 401 without auth', async () => {
    const res = await app.request('/workspace/members', {}, createTestEnv());
    expect(res.status).toBe(401);
  });

  it('POST /workspace/members/invite returns 401 without auth', async () => {
    const res = await app.request(
      '/workspace/members/invite',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegramUserId: 123 }),
      },
      createTestEnv(),
    );
    expect(res.status).toBe(401);
  });
});

describe('404 Handling', () => {
  it('returns 404 for unknown routes', async () => {
    const res = await app.request('/nonexistent', {}, createTestEnv());
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('returns 404 for random nested paths', async () => {
    const res = await app.request('/foo/bar/baz', {}, createTestEnv());
    expect(res.status).toBe(404);
  });
});

describe('CORS Headers', () => {
  it('responds with CORS headers on preflight', async () => {
    const res = await app.request(
      '/health',
      {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://example.com',
          'Access-Control-Request-Method': 'GET',
        },
      },
      createTestEnv(),
    );

    // Hono CORS middleware returns 204 for preflight
    expect([200, 204]).toContain(res.status);
    const headers = Object.fromEntries(res.headers.entries());
    expect(headers['access-control-allow-origin']).toBeDefined();
  });
});

describe('Billing Routes (Webhook — No Auth)', () => {
  it('POST /billing/stars/webhook returns 500 when secret not configured', async () => {
    const res = await app.request(
      '/billing/stars/webhook',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ not_a_valid_update: true }),
      },
      createTestEnv(),
    );

    // Secret not configured → rejects with 500
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe('SERVER_ERROR');
  });

  it('POST /billing/stars/webhook rejects invalid secret', async () => {
    const env = createTestEnv();
    (env as Record<string, unknown>).BOT_WEBHOOK_SECRET = 'test-webhook-secret';

    const res = await app.request(
      '/billing/stars/webhook',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Telegram-Bot-Api-Secret-Token': 'wrong-secret',
        },
        body: JSON.stringify({ not_a_valid_update: true }),
      },
      env,
    );

    expect(res.status).toBe(401);
  });

  it('POST /billing/stars/webhook accepts valid secret with no-op update', async () => {
    const env = createTestEnv();
    (env as Record<string, unknown>).BOT_WEBHOOK_SECRET = 'test-webhook-secret';

    const res = await app.request(
      '/billing/stars/webhook',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Telegram-Bot-Api-Secret-Token': 'test-webhook-secret',
        },
        body: JSON.stringify({ not_a_valid_update: true }),
      },
      env,
    );

    // Valid secret, no payment → ok
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});
