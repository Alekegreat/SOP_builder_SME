// ── Plan constants ──
export const PLANS = ['FREE', 'SOLO_PRO', 'TEAM', 'BUSINESS'] as const;
export type Plan = (typeof PLANS)[number];

export const PLAN_PRICES: Record<Plan, number> = {
  FREE: 0,
  SOLO_PRO: 12_00, // cents
  TEAM: 39_00,
  BUSINESS: 99_00,
};

// ── Entitlements matrix ──
export interface PlanEntitlements {
  maxWorkspaces: number;
  maxSops: number;
  maxMembers: number;
  aiCreditsPerMonth: number;
  requiresByoKey: boolean;
  fullVersionHistory: boolean;
  diffs: boolean;
  reviewCycles: boolean;
  approvalWorkflow: 'none' | 'basic' | 'full' | 'multi_stage';
  cleanExports: boolean;
  auditExports: boolean;
  analytics: 'none' | 'basic' | 'full' | 'full_api';
  rbac: 'none' | 'standard' | 'advanced';
  auditLogDays: number; // 0 = none, -1 = unlimited
  templates: 'community' | 'custom' | 'custom_share';
  retentionPolicies: boolean;
  watermarkExports: boolean;
}

export const ENTITLEMENTS: Record<Plan, PlanEntitlements> = {
  FREE: {
    maxWorkspaces: 1,
    maxSops: 10,
    maxMembers: 1,
    aiCreditsPerMonth: 0,
    requiresByoKey: true,
    fullVersionHistory: false,
    diffs: false,
    reviewCycles: false,
    approvalWorkflow: 'none',
    cleanExports: false,
    auditExports: false,
    analytics: 'none',
    rbac: 'none',
    auditLogDays: 0,
    templates: 'community',
    retentionPolicies: false,
    watermarkExports: true,
  },
  SOLO_PRO: {
    maxWorkspaces: 1,
    maxSops: 100,
    maxMembers: 1,
    aiCreditsPerMonth: 50,
    requiresByoKey: false,
    fullVersionHistory: true,
    diffs: true,
    reviewCycles: true,
    approvalWorkflow: 'basic',
    cleanExports: true,
    auditExports: false,
    analytics: 'basic',
    rbac: 'none',
    auditLogDays: 0,
    templates: 'community',
    retentionPolicies: false,
    watermarkExports: false,
  },
  TEAM: {
    maxWorkspaces: 3,
    maxSops: 500,
    maxMembers: 10,
    aiCreditsPerMonth: 200,
    requiresByoKey: false,
    fullVersionHistory: true,
    diffs: true,
    reviewCycles: true,
    approvalWorkflow: 'full',
    cleanExports: true,
    auditExports: false,
    analytics: 'full',
    rbac: 'standard',
    auditLogDays: 30,
    templates: 'custom',
    retentionPolicies: false,
    watermarkExports: false,
  },
  BUSINESS: {
    maxWorkspaces: 10,
    maxSops: -1, // unlimited
    maxMembers: 50,
    aiCreditsPerMonth: 1000,
    requiresByoKey: false,
    fullVersionHistory: true,
    diffs: true,
    reviewCycles: true,
    approvalWorkflow: 'multi_stage',
    cleanExports: true,
    auditExports: true,
    analytics: 'full_api',
    rbac: 'advanced',
    auditLogDays: -1, // unlimited
    templates: 'custom_share',
    retentionPolicies: true,
    watermarkExports: false,
  },
};

// ── SOP statuses ──
export const SOP_STATUSES = [
  'DRAFT',
  'IN_REVIEW',
  'APPROVED',
  'PUBLISHED',
  'SUPERSEDED',
  'ARCHIVED',
] as const;
export type SopStatus = (typeof SOP_STATUSES)[number];

// ── Approval states ──
export const APPROVAL_STATES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export type ApprovalState = (typeof APPROVAL_STATES)[number];

// ── Workspace roles ──
export const WORKSPACE_ROLES = ['owner', 'admin', 'editor', 'approver', 'viewer'] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

// ── Interview states ──
export const INTERVIEW_STATES = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;
export type InterviewState = (typeof INTERVIEW_STATES)[number];

// ── Payment providers ──
export const PAYMENT_PROVIDERS = ['stars', 'ton', 'walletpay'] as const;
export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number];

// ── Payment statuses ──
export const PAYMENT_STATUSES = ['pending', 'completed', 'failed', 'refunded'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

// ── Audit log actions ──
export const AUDIT_ACTIONS = [
  'sop.created',
  'sop.updated',
  'sop.status_changed',
  'sop.deleted',
  'version.created',
  'version.published',
  'interview.started',
  'interview.completed',
  'interview.cancelled',
  'approval.requested',
  'approval.approved',
  'approval.rejected',
  'member.invited',
  'member.removed',
  'member.role_changed',
  'workspace.created',
  'workspace.settings_changed',
  'billing.payment_received',
  'billing.plan_changed',
  'billing.credits_purchased',
  'checklist.started',
  'checklist.completed',
  'export.created',
  'auth.login',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

// ── Review cycle defaults ──
export const REVIEW_CYCLE_DAYS = [30, 60, 90] as const;
export const DEFAULT_REVIEW_CYCLE_DAYS = 90;

// ── Rate limits ──
export const RATE_LIMITS = {
  interviewAnswer: { maxPerMinute: 20 },
  generation: { maxPerMinute: 3 },
  apiGeneral: { maxPerMinute: 60 },
  auth: { maxPerMinute: 10 },
} as const;

// ── Token/JWT ──
export const JWT_EXPIRY_SECONDS = 3600; // 1 hour
export const INIT_DATA_MAX_AGE_SECONDS = 300; // 5 minutes

// ── Interview questions ──
export const INTERVIEW_QUESTIONS = [
  {
    key: 'purpose',
    question: 'What is the purpose of this SOP? What problem does it solve?',
    required: true,
  },
  {
    key: 'scope',
    question: 'What is the scope? Which teams, departments, or processes does this SOP cover?',
    required: true,
  },
  {
    key: 'roles',
    question:
      'Who are the key roles involved? (e.g., who owns it, who executes it, who approves it)',
    required: true,
  },
  {
    key: 'preconditions',
    question: 'What preconditions or prerequisites must be met before starting?',
    required: false,
  },
  {
    key: 'tools',
    question: 'What tools, software, or materials are needed?',
    required: false,
  },
  {
    key: 'steps',
    question:
      'Walk me through the step-by-step process. Describe each step in detail, one at a time.',
    required: true,
  },
  {
    key: 'additional_steps',
    question:
      'Are there any additional steps or sub-processes? Type "done" if you\'ve covered everything.',
    required: false,
  },
  {
    key: 'checklist',
    question: 'What checklist items should someone verify after completing this process?',
    required: true,
  },
  {
    key: 'exceptions',
    question: 'What exceptions or edge cases might arise? How should they be handled?',
    required: false,
  },
  {
    key: 'kpis',
    question: 'What KPIs or quality checks measure success for this process?',
    required: false,
  },
  {
    key: 'risks',
    question: 'What risks are associated with this process? How can they be mitigated?',
    required: false,
  },
  {
    key: 'references',
    question: 'Any references, links, or related documents? Type "none" if there are none.',
    required: false,
  },
] as const;

export type InterviewQuestionKey = (typeof INTERVIEW_QUESTIONS)[number]['key'];

// ── Staleness thresholds ──
export const STALENESS_THRESHOLDS = {
  fresh: 0, // 0-30% of cycle elapsed
  aging: 0.5, // 50-80% of cycle elapsed
  stale: 0.8, // 80-100% of cycle elapsed
  overdue: 1.0, // 100%+ of cycle elapsed
} as const;

// ── Add-on credit packs ──
export const CREDIT_PACKS = [
  { id: 'credits_50', credits: 50, priceUsd: 5_00 },
  { id: 'credits_200', credits: 200, priceUsd: 15_00 },
  { id: 'credits_500', credits: 500, priceUsd: 30_00 },
] as const;
