import { Hono } from 'hono';
import type { AppEnv } from '../app.js';

/**
 * SOP Templates — server-managed catalog of starter templates.
 * Routes are public (no auth) so the TMA can show them before workspace selection.
 */
export const templateRoutes = new Hono<AppEnv>();

export interface SopTemplate {
  id: string;
  title: string;
  description: string;
  tags: string[];
  category: string;
}

const TEMPLATE_CATALOG: SopTemplate[] = [
  {
    id: 'tpl-customer-onboarding',
    title: 'Customer Onboarding SOP',
    description: 'Step-by-step customer onboarding process from signup to first success milestone.',
    tags: ['customer-success', 'onboarding'],
    category: 'Customer Success',
  },
  {
    id: 'tpl-incident-response',
    title: 'Incident Response SOP',
    description: 'Structured incident response from detection through post-mortem and remediation.',
    tags: ['engineering', 'operations', 'incident'],
    category: 'Engineering',
  },
  {
    id: 'tpl-release-checklist',
    title: 'Release Checklist SOP',
    description: 'Comprehensive pre-release, release, and post-release verification checklist.',
    tags: ['engineering', 'devops', 'release'],
    category: 'Engineering',
  },
  {
    id: 'tpl-hiring-interview',
    title: 'Hiring Interview SOP',
    description: 'Structured hiring interview flow with scoring rubric and feedback collection.',
    tags: ['hr', 'recruiting', 'interview'],
    category: 'HR',
  },
  {
    id: 'tpl-employee-offboarding',
    title: 'Employee Offboarding SOP',
    description:
      'Complete employee offboarding including access revocation, knowledge transfer, and exit interview.',
    tags: ['hr', 'offboarding'],
    category: 'HR',
  },
  {
    id: 'tpl-data-backup',
    title: 'Data Backup & Recovery SOP',
    description: 'Backup scheduling, verification, and disaster recovery procedures.',
    tags: ['engineering', 'security', 'backup'],
    category: 'Engineering',
  },
];

/**
 * GET /templates — List all available templates
 */
templateRoutes.get('/', (c) => {
  const category = c.req.query('category');

  const filtered = category
    ? TEMPLATE_CATALOG.filter((t) => t.category.toLowerCase() === category.toLowerCase())
    : TEMPLATE_CATALOG;

  return c.json({ data: filtered });
});

/**
 * GET /templates/:id — Get a single template
 */
templateRoutes.get('/:id', (c) => {
  const id = c.req.param('id');
  const template = TEMPLATE_CATALOG.find((t) => t.id === id);
  if (!template) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Template not found' } }, 404);
  }
  return c.json(template);
});
