// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Integration tests for queue consumer handlers.
 * Uses D1/R2 mocks to exercise real handler logic paths.
 */

// ── Mock fetch globally for Telegram API and AI provider calls ──
const fetchSpy = vi.fn().mockResolvedValue({
  ok: true,
  json: () =>
    Promise.resolve({
      choices: [
        {
          message: {
            content: JSON.stringify({
              purpose: 'Test SOP',
              scope: 'Testing',
              roles: ['tester'],
              preconditions: ['None'],
              steps: [{ ord: 0, text: 'Step 1' }],
              checklistItems: [{ ord: 0, text: 'Check 1' }],
              exceptions: [{ ord: 0, text: 'Exception 1' }],
              tools: ['Tool A'],
              kpis: ['KPI A'],
              risks: ['Risk A'],
              references: ['Ref A'],
            }),
          },
        },
      ],
    }),
  text: () => Promise.resolve('ok'),
});
vi.stubGlobal('fetch', fetchSpy);

function createMockD1() {
  const storage = new Map<string, unknown>();
  const mockStmt = {
    bind: vi.fn().mockReturnThis(),
    first: vi.fn().mockResolvedValue(null),
    run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
    all: vi.fn().mockResolvedValue({ results: [] }),
  };
  return {
    prepare: vi.fn().mockReturnValue(mockStmt),
    _stmt: mockStmt,
    _storage: storage,
  };
}

function createMockR2() {
  const objects = new Map<string, { body: string; metadata: unknown }>();
  return {
    put: vi.fn().mockImplementation(async (key: string, body: string, opts?: unknown) => {
      objects.set(key, { body, metadata: opts });
    }),
    get: vi.fn().mockImplementation(async (key: string) => {
      return objects.get(key) ?? null;
    }),
    _objects: objects,
  };
}

function createMockEnv(d1: ReturnType<typeof createMockD1>, r2: ReturnType<typeof createMockR2>) {
  return {
    DB: d1,
    R2: r2,
    QUEUE: { send: vi.fn() },
    OPENAI_API_KEY: 'test-key',
    BOT_TOKEN: 'test-bot-token',
    ENVIRONMENT: 'test',
    ENCRYPTION_KEY: 'a'.repeat(64),
  };
}

describe('Queue Consumer Integration', () => {
  let mockD1: ReturnType<typeof createMockD1>;
  let mockR2: ReturnType<typeof createMockR2>;
  let mockEnv: ReturnType<typeof createMockEnv>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockD1 = createMockD1();
    mockR2 = createMockR2();
    mockEnv = createMockEnv(mockD1, mockR2);
    fetchSpy.mockClear();
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  purpose: 'Test SOP',
                  scope: 'Testing',
                  roles: ['tester'],
                  preconditions: ['None'],
                  steps: [{ ord: 0, text: 'Step 1' }],
                  checklistItems: [{ ord: 0, text: 'Check 1' }],
                  exceptions: [{ ord: 0, text: 'Exception 1' }],
                  tools: ['Tool A'],
                  kpis: ['KPI A'],
                  risks: ['Risk A'],
                  references: ['Ref A'],
                }),
              },
            },
          ],
        }),
      text: () => Promise.resolve('ok'),
    });
  });

  describe('LLM Generation Handler', () => {
    it('processes generation job and creates version', async () => {
      const { handleLlmGeneration } =
        await import('../../apps/queue-consumer/src/handlers/llm-generation.js');

      // Configure DB responses in sequence
      let callCount = 0;
      mockD1._stmt.first.mockImplementation(async () => {
        callCount++;
        switch (callCount) {
          case 1: // workspace lookup
            return { plan: 'SOLO_PRO', ai_config_json: null };
          case 2: // interview session transcript
            return {
              transcript_json: JSON.stringify([
                { questionKey: 'process_name', answer: 'Test Process' },
                { questionKey: 'purpose', answer: 'Testing' },
              ]),
            };
          case 3: // SOP title
            return { title: 'My Test SOP' };
          case 4: // last version for semver
            return null;
          case 5: // user for notification
            return { telegram_user_id: 123456 };
          default:
            return null;
        }
      });

      const job = {
        type: 'llm_generation',
        sopId: 'sop-1',
        workspaceId: 'ws-1',
        interviewSessionId: 'session-1',
        userId: 'user-1',
        isDelta: false,
      };

      await handleLlmGeneration(job, mockEnv);

      // Verify version was inserted (DB prepare called for INSERT INTO sop_versions)
      const prepCalls = mockD1.prepare.mock.calls.map((c: unknown[]) => c[0] as string);
      expect(prepCalls.some((sql: string) => sql.includes('INSERT INTO sop_versions'))).toBe(true);

      // Verify SOP was updated
      expect(prepCalls.some((sql: string) => sql.includes('UPDATE sops'))).toBe(true);

      // Verify audit log was written
      expect(prepCalls.some((sql: string) => sql.includes('INSERT INTO audit_logs'))).toBe(true);

      // Verify credits consumed (paid plan)
      expect(prepCalls.some((sql: string) => sql.includes('UPDATE usage_credits'))).toBe(true);

      // Verify Telegram notification sent
      const fetchCalls = fetchSpy.mock.calls;
      expect(fetchCalls.some((c: unknown[]) => (c[0] as string).includes('sendMessage'))).toBe(
        true,
      );
    });

    it('skips credits for FREE plan', async () => {
      const { handleLlmGeneration } =
        await import('../../apps/queue-consumer/src/handlers/llm-generation.js');

      let callCount = 0;
      mockD1._stmt.first.mockImplementation(async () => {
        callCount++;
        switch (callCount) {
          case 1:
            return { plan: 'FREE', ai_config_json: null };
          case 2:
            return { transcript_json: '[]' };
          case 3:
            return { title: 'Free SOP' };
          case 4:
            return null;
          case 5:
            return null; // no user → no notification
          default:
            return null;
        }
      });

      await handleLlmGeneration(
        {
          type: 'llm_generation',
          sopId: 'sop-2',
          workspaceId: 'ws-2',
          interviewSessionId: 's-2',
          userId: 'u-2',
          isDelta: false,
        },
        mockEnv,
      );

      const prepCalls = mockD1.prepare.mock.calls.map((c: unknown[]) => c[0] as string);
      // Should NOT consume credits for FREE plan
      expect(prepCalls.filter((s: string) => s.includes('UPDATE usage_credits')).length).toBe(0);
    });

    it('throws when workspace not found', async () => {
      const { handleLlmGeneration } =
        await import('../../apps/queue-consumer/src/handlers/llm-generation.js');

      mockD1._stmt.first.mockResolvedValue(null);

      await expect(
        handleLlmGeneration(
          {
            type: 'llm_generation',
            sopId: 'sop-x',
            workspaceId: 'ws-x',
            interviewSessionId: 's-x',
            userId: 'u-x',
            isDelta: false,
          },
          mockEnv,
        ),
      ).rejects.toThrow('Workspace not found');
    });
  });

  describe('Export Handler', () => {
    it('processes HTML export and stores in R2', async () => {
      const { handleExport } = await import('../../apps/queue-consumer/src/handlers/export.js');

      let callCount = 0;
      mockD1._stmt.first.mockImplementation(async () => {
        callCount++;
        switch (callCount) {
          case 1: // workspace plan
            return { plan: 'SOLO_PRO' };
          case 2: // version content
            return {
              content_json: JSON.stringify({
                purpose: 'Test',
                scope: 'Test',
                roles: 'Tester',
                steps: [{ ord: 0, text: 'Step 1' }],
                checklistItems: [],
                exceptions: [],
              }),
              semver: '1.0.0',
              created_at: '2025-01-01T00:00:00Z',
              created_by_user_id: 'u-1',
            };
          case 3: // SOP title
            return { title: 'Export Test SOP' };
          case 4: // author
            return { name: 'Test Author' };
          case 5: // user for notification
            return { telegram_user_id: 789 };
          default:
            return null;
        }
      });

      await handleExport(
        {
          type: 'export',
          sopId: 'sop-1',
          versionId: 'v-1',
          workspaceId: 'ws-1',
          userId: 'user-1',
          format: 'html',
        },
        mockEnv,
      );

      // Verify R2 put was called
      expect(mockR2.put).toHaveBeenCalledWith(
        'exports/ws-1/sop-1/v-1.html',
        expect.any(String),
        expect.objectContaining({
          httpMetadata: { contentType: 'text/html' },
        }),
      );

      // Verify attachment record inserted
      const prepCalls = mockD1.prepare.mock.calls.map((c: unknown[]) => c[0] as string);
      expect(prepCalls.some((s: string) => s.includes('INSERT INTO attachments'))).toBe(true);

      // Verify audit log
      expect(prepCalls.some((s: string) => s.includes('INSERT INTO audit_logs'))).toBe(true);
    });

    it('adds watermark for FREE plan', async () => {
      const { handleExport } = await import('../../apps/queue-consumer/src/handlers/export.js');

      let callCount = 0;
      mockD1._stmt.first.mockImplementation(async () => {
        callCount++;
        switch (callCount) {
          case 1:
            return { plan: 'FREE' };
          case 2:
            return {
              content_json: JSON.stringify({
                purpose: 'Free test',
                scope: 'Free',
                roles: 'Free Role',
                steps: [{ ord: 0, text: 'S1' }],
                checklistItems: [],
                exceptions: [],
              }),
              semver: '0.1.0',
              created_at: '2025-01-01T00:00:00Z',
              created_by_user_id: 'u-free',
            };
          case 3:
            return { title: 'Free SOP' };
          case 4:
            return { name: 'Free User' };
          case 5:
            return { telegram_user_id: 111 };
          default:
            return null;
        }
      });

      await handleExport(
        {
          type: 'export',
          sopId: 'sop-f',
          versionId: 'v-f',
          workspaceId: 'ws-f',
          userId: 'u-f',
          format: 'html',
        },
        mockEnv,
      );

      // R2 was called — the HTML content should contain watermark text
      const storedContent = mockR2.put.mock.calls[0]?.[1] as string;
      expect(storedContent).toContain('SOP Builder');
    });

    it('throws when version not found', async () => {
      const { handleExport } = await import('../../apps/queue-consumer/src/handlers/export.js');

      let callCount = 0;
      mockD1._stmt.first.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) return { plan: 'FREE' };
        return null; // version not found
      });

      await expect(
        handleExport(
          {
            type: 'export',
            sopId: 'x',
            versionId: 'x',
            workspaceId: 'x',
            userId: 'x',
            format: 'html',
          },
          mockEnv,
        ),
      ).rejects.toThrow('Version not found');
    });
  });

  describe('Digest Handler', () => {
    it('sends weekly digest to workspace owners', async () => {
      const { handleDigest } = await import('../../apps/queue-consumer/src/handlers/digest.js');

      mockD1._stmt.first
        .mockResolvedValueOnce({ cnt: 3 }) // new sops
        .mockResolvedValueOnce({ cnt: 5 }) // new versions
        .mockResolvedValueOnce({ cnt: 2 }) // pending approvals
        .mockResolvedValueOnce({ cnt: 1 }); // stale sops

      mockD1._stmt.all.mockResolvedValueOnce({
        results: [{ telegram_user_id: 12345 }, { telegram_user_id: 67890 }],
      });

      await handleDigest({ type: 'digest', workspaceId: 'ws-1' }, mockEnv);

      // Verify sendMessage called for each owner
      const msgCalls = fetchSpy.mock.calls.filter((c: unknown[]) =>
        (c[0] as string).includes('sendMessage'),
      );
      expect(msgCalls.length).toBe(2);

      // Verify digest content
      const body = JSON.parse((msgCalls[0][1] as { body: string }).body);
      expect(body.text).toContain('Weekly SOP Digest');
      expect(body.text).toContain('New SOPs: 3');
    });

    it('handles workspace with no owners gracefully', async () => {
      const { handleDigest } = await import('../../apps/queue-consumer/src/handlers/digest.js');

      mockD1._stmt.first
        .mockResolvedValueOnce({ cnt: 0 })
        .mockResolvedValueOnce({ cnt: 0 })
        .mockResolvedValueOnce({ cnt: 0 })
        .mockResolvedValueOnce({ cnt: 0 });

      mockD1._stmt.all.mockResolvedValueOnce({ results: [] });

      await handleDigest({ type: 'digest', workspaceId: 'ws-empty' }, mockEnv);

      // No sendMessage calls since no owners
      const msgCalls = fetchSpy.mock.calls.filter((c: unknown[]) =>
        (c[0] as string).includes('sendMessage'),
      );
      expect(msgCalls.length).toBe(0);
    });
  });

  describe('Reminder Handler', () => {
    it('sends review reminder to SOP owner', async () => {
      const { handleReminder } = await import('../../apps/queue-consumer/src/handlers/reminder.js');

      let callCount = 0;
      mockD1._stmt.first.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) return { title: 'Onboarding SOP', next_review_at: '2025-07-01' };
        if (callCount === 2) return { telegram_user_id: 54321 };
        return null;
      });

      await handleReminder(
        {
          type: 'reminder',
          sopId: 'sop-1',
          workspaceId: 'ws-1',
          ownerUserId: 'user-1',
        },
        mockEnv,
      );

      const msgCalls = fetchSpy.mock.calls.filter((c: unknown[]) =>
        (c[0] as string).includes('sendMessage'),
      );
      expect(msgCalls.length).toBe(1);

      const body = JSON.parse((msgCalls[0][1] as { body: string }).body);
      expect(body.text).toContain('Review Reminder');
      expect(body.text).toContain('Onboarding SOP');
      expect(body.chat_id).toBe(54321);
    });

    it('silently exits when SOP not found', async () => {
      const { handleReminder } = await import('../../apps/queue-consumer/src/handlers/reminder.js');
      mockD1._stmt.first.mockResolvedValue(null);

      await handleReminder(
        { type: 'reminder', sopId: 'gone', workspaceId: 'ws', ownerUserId: 'u' },
        mockEnv,
      );

      const msgCalls = fetchSpy.mock.calls.filter((c: unknown[]) =>
        (c[0] as string).includes('sendMessage'),
      );
      expect(msgCalls.length).toBe(0);
    });

    it('silently exits when user has no telegram_user_id', async () => {
      const { handleReminder } = await import('../../apps/queue-consumer/src/handlers/reminder.js');

      let callCount = 0;
      mockD1._stmt.first.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) return { title: 'SOP', next_review_at: '2025-07-01' };
        return { telegram_user_id: null };
      });

      await handleReminder(
        { type: 'reminder', sopId: 's', workspaceId: 'ws', ownerUserId: 'u' },
        mockEnv,
      );

      const msgCalls = fetchSpy.mock.calls.filter((c: unknown[]) =>
        (c[0] as string).includes('sendMessage'),
      );
      expect(msgCalls.length).toBe(0);
    });
  });

  describe('Message routing', () => {
    it('routes to correct handler by type', async () => {
      const consumer = (await import('../../apps/queue-consumer/src/index.js')).default;

      const messages = [
        {
          body: { type: 'unknown_type' },
          ack: vi.fn(),
          retry: vi.fn(),
        },
      ];
      const batch = { messages } as unknown as MessageBatch<{ type: string }>;

      // unknown_type should log error but ack the message
      await consumer.queue(batch, mockEnv);
      expect(messages[0].ack).toHaveBeenCalled();
    });

    it('retries on handler error', async () => {
      const consumer = (await import('../../apps/queue-consumer/src/index.js')).default;

      // LLM generation with no DB results will throw
      mockD1._stmt.first.mockResolvedValue(null);
      const messages = [
        {
          body: {
            type: 'llm_generation',
            sopId: 's',
            workspaceId: 'ws',
            interviewSessionId: 'i',
            userId: 'u',
            isDelta: false,
          },
          ack: vi.fn(),
          retry: vi.fn(),
        },
      ];
      const batch = { messages } as unknown as MessageBatch<{ type: string }>;

      await consumer.queue(batch, mockEnv);
      expect(messages[0].retry).toHaveBeenCalled();
      expect(messages[0].ack).not.toHaveBeenCalled();
    });
  });
});
