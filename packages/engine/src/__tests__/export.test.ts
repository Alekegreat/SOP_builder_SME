// @ts-nocheck
import { describe, it, expect } from 'vitest';
import { renderSopToHtml } from '@sop/engine';
import type { SopContent } from '@sop/shared';

describe('Export', () => {
  const sampleContent: SopContent = {
    purpose: 'Test SOP purpose',
    scope: 'Test scope',
    roles: 'Admin, Editor',
    steps: [{ ord: 0, text: 'Step 1: Do this' }, { ord: 1, text: 'Step 2: Do that' }],
    checklistItems: [{ ord: 0, text: 'Check item 1' }, { ord: 1, text: 'Check item 2' }],
    exceptions: [{ ord: 0, text: 'Exception 1' }],
    kpis: 'Completion rate > 95%',
    risks: 'Data loss risk',
    references: 'ISO 9001',
    markdown: '# Test',
  };

  const baseOptions = {
    title: 'Test SOP',
    version: 'v1.0',
    author: 'John Doe',
    createdAt: '2024-01-01',
    watermark: false,
  };

  describe('renderSopToHtml', () => {
    it('renders HTML document', () => {
      const html = renderSopToHtml(sampleContent, baseOptions);
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('Test SOP');
      expect(html).toContain('v1.0');
    });

    it('includes all content sections', () => {
      const html = renderSopToHtml(sampleContent, baseOptions);
      expect(html).toContain('Test SOP purpose');
      expect(html).toContain('Step 1: Do this');
      expect(html).toContain('Check item 1');
      expect(html).toContain('Exception 1');
    });

    it('adds watermark for free plan', () => {
      const html = renderSopToHtml(sampleContent, {
        ...baseOptions,
        watermark: true,
      });
      expect(html.toLowerCase()).toContain('sop builder');
    });

    it('omits watermark for paid plan', () => {
      const html = renderSopToHtml(sampleContent, {
        ...baseOptions,
        watermark: false,
      });
      // Should not have the watermark class/element
      expect(html).not.toContain('watermark');
    });

    it('includes CSS for print', () => {
      const html = renderSopToHtml(sampleContent, baseOptions);
      expect(html).toContain('@media print');
    });
  });
});
