// @ts-nocheck
import { describe, it, expect } from 'vitest';
import { renderSopToHtml } from '@sop/engine';
import type { SopContent } from '@sop/shared';

describe('Export', () => {
  const sampleContent: SopContent = {
    purpose: 'Test SOP purpose',
    scope: 'Test scope',
    roles: 'Admin, Editor',
    steps: [
      { ord: 0, text: 'Step 1: Do this' },
      { ord: 1, text: 'Step 2: Do that' },
    ],
    checklistItems: [
      { ord: 0, text: 'Check item 1' },
      { ord: 1, text: 'Check item 2' },
    ],
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
      expect(html).toContain('class="watermark"');
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

    it('renders without optional preconditions', () => {
      const content = { ...sampleContent, preconditions: '' };
      const html = renderSopToHtml(content, baseOptions);
      expect(html).not.toContain('Preconditions');
    });

    it('renders with preconditions when present', () => {
      const content = { ...sampleContent, preconditions: 'Must have access to system' };
      const html = renderSopToHtml(content, baseOptions);
      expect(html).toContain('Preconditions');
      expect(html).toContain('Must have access to system');
    });

    it('renders without optional tools', () => {
      const content = { ...sampleContent, tools: '' };
      const html = renderSopToHtml(content, baseOptions);
      expect(html).not.toContain('Tools &amp; Materials');
    });

    it('renders with tools when present', () => {
      const content = { ...sampleContent, tools: 'Jira, Confluence' };
      const html = renderSopToHtml(content, baseOptions);
      expect(html).toContain('Tools');
      expect(html).toContain('Jira, Confluence');
    });

    it('renders without exceptions when empty', () => {
      const content = { ...sampleContent, exceptions: [] };
      const html = renderSopToHtml(content, baseOptions);
      expect(html).not.toContain('Exceptions');
    });

    it('renders without optional kpis', () => {
      const content = { ...sampleContent, kpis: '' };
      const html = renderSopToHtml(content, baseOptions);
      expect(html).not.toContain('KPIs');
    });

    it('renders with kpis when present', () => {
      const html = renderSopToHtml(sampleContent, baseOptions);
      expect(html).toContain('KPIs');
      expect(html).toContain('Completion rate');
    });

    it('renders without optional risks', () => {
      const content = { ...sampleContent, risks: '' };
      const html = renderSopToHtml(content, baseOptions);
      expect(html).not.toContain('Risks');
    });

    it('renders with risks when present', () => {
      const html = renderSopToHtml(sampleContent, baseOptions);
      expect(html).toContain('Risks');
      expect(html).toContain('Data loss risk');
    });

    it('renders without optional references', () => {
      const content = { ...sampleContent, references: '' };
      const html = renderSopToHtml(content, baseOptions);
      expect(html).not.toContain('References');
    });

    it('renders with references when present', () => {
      const html = renderSopToHtml(sampleContent, baseOptions);
      expect(html).toContain('References');
      expect(html).toContain('ISO 9001');
    });

    it('renders minimal content with all optional fields empty', () => {
      const content: SopContent = {
        purpose: 'Minimal',
        scope: 'Minimal scope',
        roles: 'Admin',
        preconditions: '',
        tools: '',
        steps: [{ ord: 0, text: 'Do it' }],
        checklistItems: [{ ord: 0, text: 'Done?' }],
        exceptions: [],
        kpis: '',
        risks: '',
        references: '',
        markdown: '',
      };
      const html = renderSopToHtml(content, baseOptions);
      expect(html).toContain('Minimal');
      expect(html).toContain('Do it');
      expect(html).not.toContain('Preconditions');
      expect(html).not.toContain('Tools');
      expect(html).not.toContain('Exceptions');
      expect(html).not.toContain('KPIs');
      expect(html).not.toContain('Risks');
      expect(html).not.toContain('References');
    });

    it('escapes HTML special characters in content', () => {
      const content = { ...sampleContent, purpose: '<script>alert("xss")</script>' };
      const html = renderSopToHtml(content, baseOptions);
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
    });
  });
});
