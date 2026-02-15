// @ts-nocheck
import { describe, it, expect } from 'vitest';
import {
  PLANS,
  ENTITLEMENTS,
  INTERVIEW_QUESTIONS,
  RATE_LIMITS,
  JWT_EXPIRY_SECONDS,
  INIT_DATA_MAX_AGE_SECONDS,
  CREDIT_PACKS,
} from '@sop/shared';

describe('Shared Constants', () => {
  describe('PLANS', () => {
    it('has all plan tiers', () => {
      expect(PLANS).toContain('FREE');
      expect(PLANS).toContain('SOLO_PRO');
      expect(PLANS).toContain('TEAM');
      expect(PLANS).toContain('BUSINESS');
    });
  });

  describe('ENTITLEMENTS', () => {
    it('has entitlements for every plan', () => {
      for (const plan of PLANS) {
        expect(ENTITLEMENTS).toHaveProperty(plan);
      }
    });

    it('FREE plan requires BYO key', () => {
      expect(ENTITLEMENTS.FREE.requiresByoKey).toBe(true);
    });

    it('BUSINESS plan has unlimited SOPs', () => {
      expect(ENTITLEMENTS.BUSINESS.maxSops).toBe(-1);
    });

    it('higher plans have more features', () => {
      expect(ENTITLEMENTS.SOLO_PRO.maxSops).toBeGreaterThan(ENTITLEMENTS.FREE.maxSops);
    });
  });

  describe('INTERVIEW_QUESTIONS', () => {
    it('has at least 10 questions', () => {
      expect(INTERVIEW_QUESTIONS.length).toBeGreaterThanOrEqual(10);
    });

    it('each question has key, question, and required fields', () => {
      for (const q of INTERVIEW_QUESTIONS) {
        expect(q).toHaveProperty('key');
        expect(q).toHaveProperty('question');
        expect(q).toHaveProperty('required');
      }
    });

    it('purpose and scope are required', () => {
      const purpose = INTERVIEW_QUESTIONS.find((q) => q.key === 'purpose');
      const scope = INTERVIEW_QUESTIONS.find((q) => q.key === 'scope');
      expect(purpose?.required).toBe(true);
      expect(scope?.required).toBe(true);
    });

    it('has unique keys', () => {
      const keys = INTERVIEW_QUESTIONS.map((q) => q.key);
      expect(new Set(keys).size).toBe(keys.length);
    });
  });

  describe('RATE_LIMITS', () => {
    it('has limits for all categories', () => {
      expect(RATE_LIMITS).toHaveProperty('interviewAnswer');
      expect(RATE_LIMITS).toHaveProperty('generation');
      expect(RATE_LIMITS).toHaveProperty('apiGeneral');
      expect(RATE_LIMITS).toHaveProperty('auth');
    });
  });

  describe('JWT_EXPIRY_SECONDS', () => {
    it('is 1 hour', () => {
      expect(JWT_EXPIRY_SECONDS).toBe(3600);
    });
  });

  describe('INIT_DATA_MAX_AGE_SECONDS', () => {
    it('is 5 minutes', () => {
      expect(INIT_DATA_MAX_AGE_SECONDS).toBe(300);
    });
  });

  describe('CREDIT_PACKS', () => {
    it('has defined credit packs', () => {
      expect(CREDIT_PACKS.length).toBeGreaterThanOrEqual(3);
      for (const pack of CREDIT_PACKS) {
        expect(pack).toHaveProperty('credits');
        expect(pack).toHaveProperty('priceUsd');
        expect(pack.credits).toBeGreaterThan(0);
        expect(pack.priceUsd).toBeGreaterThan(0);
      }
    });
  });
});
