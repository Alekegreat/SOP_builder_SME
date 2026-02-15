// @ts-nocheck
import { describe, it, expect } from 'vitest';
import {
  TelegramAuthSchema,
  CreateSopSchema,
  SopContentSchema,
  InterviewAnswerSchema,
  DecideApprovalSchema,
  TonConfirmSchema,
  AiProviderConfigSchema,
} from '@sop/shared';

describe('Shared Schemas', () => {
  describe('TelegramAuthSchema', () => {
    it('validates valid initData', () => {
      const result = TelegramAuthSchema.safeParse({ initData: 'auth_date=123&hash=abc' });
      expect(result.success).toBe(true);
    });

    it('rejects empty initData', () => {
      const result = TelegramAuthSchema.safeParse({ initData: '' });
      expect(result.success).toBe(false);
    });

    it('rejects missing initData', () => {
      const result = TelegramAuthSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('CreateSopSchema', () => {
    it('validates valid SOP creation', () => {
      const result = CreateSopSchema.safeParse({
        workspaceId: 'ws-1',
        title: 'My SOP',
        tags: ['hr', 'onboarding'],
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty title', () => {
      const result = CreateSopSchema.safeParse({
        workspaceId: 'ws-1',
        title: '',
        tags: [],
      });
      expect(result.success).toBe(false);
    });

    it('accepts empty tags array', () => {
      const result = CreateSopSchema.safeParse({
        workspaceId: 'ws-1',
        title: 'Test',
        tags: [],
      });
      expect(result.success).toBe(true);
    });
  });

  describe('InterviewAnswerSchema', () => {
    it('validates valid answer', () => {
      const result = InterviewAnswerSchema.safeParse({
        questionKey: 'purpose',
        answer: 'To standardize operations',
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty answer (skip logic handled in FSM, not schema)', () => {
      const result = InterviewAnswerSchema.safeParse({
        questionKey: 'kpis',
        answer: '',
      });
      // Schema requires min(1), skipping is handled by FSM logic before validation or by skipping validation
      expect(result.success).toBe(false);
    });
  });

  describe('DecideApprovalSchema', () => {
    it('validates APPROVED decision', () => {
      const result = DecideApprovalSchema.safeParse({
        decision: 'APPROVED',
      });
      expect(result.success).toBe(true);
    });

    it('validates REJECTED with comment', () => {
      const result = DecideApprovalSchema.safeParse({
        decision: 'REJECTED',
        comment: 'Needs more detail',
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid decision', () => {
      const result = DecideApprovalSchema.safeParse({
        decision: 'MAYBE',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('SopContentSchema', () => {
    it('validates complete SOP content', () => {
      const result = SopContentSchema.safeParse({
        purpose: 'Test',
        scope: 'Test scope',
        roles: 'Admin',
        steps: [{ ord: 0, text: 'Step 1' }],
        checklistItems: [{ ord: 0, text: 'Check 1' }],
        exceptions: [],
        kpis: '',
        risks: '',
        references: '',
        markdown: '# Test',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('TonConfirmSchema', () => {
    it('validates TON confirmation', () => {
      const result = TonConfirmSchema.safeParse({
        workspaceId: 'ws-1',
        transactionHash: '0xabc123',
        amount: '1000000000',
        planId: 'SOLO_PRO',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('AiProviderConfigSchema', () => {
    it('validates AI config', () => {
      const result = AiProviderConfigSchema.safeParse({
        provider: 'openai',
        model: 'gpt-4o-mini',
        apiKey: 'sk-test',
        baseUrl: 'https://api.openai.com/v1',
      });
      expect(result.success).toBe(true);
    });
  });
});
