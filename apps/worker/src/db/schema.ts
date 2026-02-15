import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';

// ── Users ──
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  telegramUserId: integer('telegram_user_id').notNull().unique(),
  name: text('name').notNull(),
  createdAt: text('created_at').notNull(),
});

// ── Workspaces ──
export const workspaces = sqliteTable('workspaces', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  ownerUserId: text('owner_user_id')
    .notNull()
    .references(() => users.id),
  plan: text('plan').notNull().default('FREE'),
  policyJson: text('policy_json').notNull().default('{}'),
  aiConfigJson: text('ai_config_json'), // encrypted BYO key config
  createdAt: text('created_at').notNull(),
});

// ── Memberships ──
export const memberships = sqliteTable(
  'memberships',
  {
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    role: text('role').notNull().default('viewer'),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.workspaceId, table.userId] }),
  }),
);

// ── SOPs ──
export const sops = sqliteTable('sops', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id')
    .notNull()
    .references(() => workspaces.id),
  title: text('title').notNull(),
  status: text('status').notNull().default('DRAFT'),
  ownerUserId: text('owner_user_id')
    .notNull()
    .references(() => users.id),
  currentVersionId: text('current_version_id'),
  nextReviewAt: text('next_review_at'),
  tagsJson: text('tags_json').notNull().default('[]'),
  createdAt: text('created_at').notNull(),
});

// ── SOP Versions ──
export const sopVersions = sqliteTable('sop_versions', {
  id: text('id').primaryKey(),
  sopId: text('sop_id')
    .notNull()
    .references(() => sops.id),
  semver: text('semver').notNull(),
  changeSummary: text('change_summary').notNull().default(''),
  contentJson: text('content_json').notNull(),
  createdByUserId: text('created_by_user_id')
    .notNull()
    .references(() => users.id),
  createdAt: text('created_at').notNull(),
});

// ── SOP Steps ──
export const sopSteps = sqliteTable('sop_steps', {
  id: text('id').primaryKey(),
  versionId: text('version_id')
    .notNull()
    .references(() => sopVersions.id),
  ord: integer('ord').notNull(),
  text: text('text').notNull(),
});

// ── SOP Check Items ──
export const sopCheckItems = sqliteTable('sop_checkitems', {
  id: text('id').primaryKey(),
  versionId: text('version_id')
    .notNull()
    .references(() => sopVersions.id),
  ord: integer('ord').notNull(),
  text: text('text').notNull(),
});

// ── SOP Exceptions ──
export const sopExceptions = sqliteTable('sop_exceptions', {
  id: text('id').primaryKey(),
  versionId: text('version_id')
    .notNull()
    .references(() => sopVersions.id),
  ord: integer('ord').notNull(),
  text: text('text').notNull(),
});

// ── Interview Sessions ──
export const interviewSessions = sqliteTable('interview_sessions', {
  id: text('id').primaryKey(),
  sopId: text('sop_id')
    .notNull()
    .references(() => sops.id),
  workspaceId: text('workspace_id')
    .notNull()
    .references(() => workspaces.id),
  state: text('state').notNull().default('NOT_STARTED'),
  transcriptJson: text('transcript_json').notNull().default('[]'),
  currentQuestionIndex: integer('current_question_index').notNull().default(0),
  createdByUserId: text('created_by_user_id')
    .notNull()
    .references(() => users.id),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// ── Approvals ──
export const approvals = sqliteTable('approvals', {
  id: text('id').primaryKey(),
  sopId: text('sop_id')
    .notNull()
    .references(() => sops.id),
  versionId: text('version_id')
    .notNull()
    .references(() => sopVersions.id),
  state: text('state').notNull().default('PENDING'),
  approverUserId: text('approver_user_id')
    .notNull()
    .references(() => users.id),
  decidedAt: text('decided_at'),
  comment: text('comment'),
});

// ── Checklist Runs ──
export const checklistRuns = sqliteTable('checklist_runs', {
  id: text('id').primaryKey(),
  sopId: text('sop_id')
    .notNull()
    .references(() => sops.id),
  versionId: text('version_id')
    .notNull()
    .references(() => sopVersions.id),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  startedAt: text('started_at').notNull(),
  completedAt: text('completed_at'),
  itemsJson: text('items_json').notNull().default('[]'),
});

// ── Attachments ──
export const attachments = sqliteTable('attachments', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id')
    .notNull()
    .references(() => workspaces.id),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  r2Key: text('r2_key').notNull(),
  mime: text('mime').notNull(),
  createdAt: text('created_at').notNull(),
});

// ── Audit Logs ──
export const auditLogs = sqliteTable('audit_logs', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id')
    .notNull()
    .references(() => workspaces.id),
  actorUserId: text('actor_user_id')
    .notNull()
    .references(() => users.id),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  metaJson: text('meta_json'),
  at: text('at').notNull(),
});

// ── Billing Customers ──
export const billingCustomers = sqliteTable(
  'billing_customers',
  {
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    provider: text('provider').notNull(),
    externalCustomerId: text('external_customer_id').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.workspaceId, table.provider] }),
  }),
);

// ── Payment Events ──
export const paymentEvents = sqliteTable('payment_events', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id')
    .notNull()
    .references(() => workspaces.id),
  provider: text('provider').notNull(),
  status: text('status').notNull().default('pending'),
  externalId: text('external_id').notNull(),
  amount: integer('amount').notNull(),
  currency: text('currency').notNull(),
  at: text('at').notNull(),
  rawJson: text('raw_json').notNull().default('{}'),
});

// ── Usage Credits ──
export const usageCredits = sqliteTable(
  'usage_credits',
  {
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    periodYyyymm: text('period_yyyymm').notNull(),
    creditsIncluded: integer('credits_included').notNull().default(0),
    creditsBought: integer('credits_bought').notNull().default(0),
    creditsUsed: integer('credits_used').notNull().default(0),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.workspaceId, table.periodYyyymm] }),
  }),
);

// ── Daily Metrics ──
export const dailyMetrics = sqliteTable(
  'daily_metrics',
  {
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    date: text('date').notNull(), // YYYY-MM-DD
    sopsCreated: integer('sops_created').notNull().default(0),
    versionsCreated: integer('versions_created').notNull().default(0),
    interviewsCompleted: integer('interviews_completed').notNull().default(0),
    approvalsDecided: integer('approvals_decided').notNull().default(0),
    checklistRunsCompleted: integer('checklist_runs_completed').notNull().default(0),
    creditsUsed: integer('credits_used').notNull().default(0),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.workspaceId, table.date] }),
  }),
);

// ── Rate limit tracking ──
export const rateLimits = sqliteTable(
  'rate_limits',
  {
    key: text('key').notNull(), // e.g., "user:123:interview"
    windowStart: integer('window_start').notNull(),
    count: integer('count').notNull().default(0),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.key] }),
  }),
);
