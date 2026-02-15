import { describe, it, expect } from 'vitest';
import { generateDiff, countChanges } from '@sop/engine';
import type { SopContent } from '@sop/shared';

describe('Diff', () => {
  const baseSop: SopContent = {
    purpose: 'Test purpose',
    scope: 'Test scope',
    roles: 'Admin, Editor',
    preconditions: 'Precondition 1',
    tools: 'Tool 1',
    steps: [{ ord: 0, text: 'Step 1' }, { ord: 1, text: 'Step 2' }, { ord: 2, text: 'Step 3' }],
    checklistItems: [{ ord: 0, text: 'Check 1' }, { ord: 1, text: 'Check 2' }],
    exceptions: [{ ord: 0, text: 'Exception 1' }],
    kpis: 'KPI 1',
    risks: 'Risk 1',
    references: 'Ref 1',
    markdown: '# Test',
  };

  describe('generateDiff', () => {
    it('detects no changes between identical SOPs', () => {
      const diff = generateDiff(baseSop, { ...baseSop });
      expect(diff.fields.filter((d) => d.op !== 'unchanged')).toHaveLength(0);
    });

    it('detects changed text fields', () => {
      const updated = { ...baseSop, purpose: 'New purpose' };
      const diff = generateDiff(baseSop, updated);
      const purposeDiff = diff.fields.find((d) => d.field === 'Purpose');
      expect(purposeDiff?.op).toBe('changed');
    });

    it('detects added steps', () => {
      const updated = { ...baseSop, steps: [...baseSop.steps, { ord: 3, text: 'Step 4' }] };
      const diff = generateDiff(baseSop, updated);
      expect(diff.steps.some((i) => i.op === 'added')).toBe(true);
    });

    it('detects removed steps', () => {
      const updated = { ...baseSop, steps: [{ ord: 0, text: 'Step 1' }] };
      const diff = generateDiff(baseSop, updated);
      expect(diff.steps.some((i) => i.op === 'removed')).toBe(true);
    });

    it('generates a summary string', () => {
      const updated = { ...baseSop, purpose: 'New purpose', steps: [...baseSop.steps, { ord: 3, text: 'Step 4' }] };
      const diff = generateDiff(baseSop, updated);
      expect(diff.summary).toBeTruthy();
      expect(typeof diff.summary).toBe('string');
    });
  });

  describe('countChanges', () => {
    it('returns change stats', () => {
      const updated = { ...baseSop, purpose: 'New', scope: 'New scope' };
      const diff = generateDiff(baseSop, updated);
      const changes = countChanges(diff);
      expect(changes.purposeChanged).toBe(true);
      expect(changes.scopeChanged).toBe(true);
      expect(changes.rolesChanged).toBe(false);
    });

    it('calculates step change count', () => {
      const updated = {
        ...baseSop,
        steps: [{ ord: 0, text: 'Step 1' }, { ord: 1, text: 'New Step 2' }, { ord: 2, text: 'New Step 3' }],
      };
      const diff = generateDiff(baseSop, updated);
      const changes = countChanges(diff);
      expect(changes.stepsChanged).toBeGreaterThan(0);
    });
  });
});
