import { z } from 'zod';
import {
  SOP_STATUSES,
  APPROVAL_STATES,
  WORKSPACE_ROLES,
  INTERVIEW_STATES,
  PAYMENT_PROVIDERS,
  PAYMENT_STATUSES,
  PLANS,
  AUDIT_ACTIONS,
} from './constants.js';

// ── Primitives ──
export const IdSchema = z.string().uuid();
export const TelegramUserIdSchema = z.number().int().positive();
export const SemverSchema = z.string().regex(/^v\d+\.\d+$/, 'Must be vMAJOR.MINOR format');
export const TimestampSchema = z.string().datetime();

// ── Auth ──
export const TelegramAuthSchema = z.object({
  initData: z.string().min(1),
});

export const AuthResponseSchema = z.object({
  accessToken: z.string(),
  user: z.object({
    id: z.string(),
    telegramUserId: z.number(),
    name: z.string(),
  }),
  workspaceId: z.string(),
});

// ── User ──
export const UserSchema = z.object({
  id: z.string(),
  telegramUserId: z.number(),
  name: z.string(),
  createdAt: z.string(),
});

// ── Workspace ──
export const WorkspacePolicySchema = z.object({
  strictApprovals: z.boolean().default(false),
  defaultReviewCycleDays: z.number().int().min(7).max(365).default(90),
  requireApprovalForPublish: z.boolean().default(false),
});

export const WorkspaceSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(100),
  ownerUserId: z.string(),
  plan: z.enum(PLANS),
  policyJson: WorkspacePolicySchema,
  createdAt: z.string(),
});

export const CreateWorkspaceSchema = z.object({
  name: z.string().min(1).max(100),
});

// ── Membership ──
export const MembershipSchema = z.object({
  workspaceId: z.string(),
  userId: z.string(),
  role: z.enum(WORKSPACE_ROLES),
});

// ── SOP ──
export const SopSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  title: z.string().min(1).max(200),
  status: z.enum(SOP_STATUSES),
  ownerUserId: z.string(),
  currentVersionId: z.string().nullable(),
  nextReviewAt: z.string().nullable(),
  tagsJson: z.array(z.string()).default([]),
  createdAt: z.string(),
});

export const CreateSopSchema = z.object({
  workspaceId: z.string(),
  title: z.string().min(1).max(200),
  tags: z.array(z.string()).max(20).default([]),
});

export const UpdateSopSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  tags: z.array(z.string()).max(20).optional(),
});

// ── SOP Version Content ──
export const SopStepSchema = z.object({
  ord: z.number().int().min(0),
  text: z.string().min(1),
});

export const SopCheckItemSchema = z.object({
  ord: z.number().int().min(0),
  text: z.string().min(1),
});

export const SopExceptionSchema = z.object({
  ord: z.number().int().min(0),
  text: z.string().min(1),
});

export const SopContentSchema = z.object({
  purpose: z.string(),
  scope: z.string(),
  roles: z.string(),
  preconditions: z.string().default(''),
  tools: z.string().default(''),
  steps: z.array(SopStepSchema),
  checklistItems: z.array(SopCheckItemSchema),
  exceptions: z.array(SopExceptionSchema),
  kpis: z.string().default(''),
  risks: z.string().default(''),
  references: z.string().default(''),
  markdown: z.string(), // full markdown render
});

export const SopVersionSchema = z.object({
  id: z.string(),
  sopId: z.string(),
  semver: SemverSchema,
  changeSummary: z.string(),
  contentJson: SopContentSchema,
  createdByUserId: z.string(),
  createdAt: z.string(),
});

// ── Interview ──
export const InterviewTranscriptEntrySchema = z.object({
  questionKey: z.string(),
  question: z.string(),
  answer: z.string(),
  answeredAt: z.string(),
});

export const InterviewSessionSchema = z.object({
  id: z.string(),
  sopId: z.string(),
  workspaceId: z.string(),
  state: z.enum(INTERVIEW_STATES),
  transcriptJson: z.array(InterviewTranscriptEntrySchema),
  createdByUserId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const InterviewAnswerSchema = z.object({
  questionKey: z.string(),
  answer: z.string().min(1).max(10000),
});

export const InterviewStartResponseSchema = z.object({
  sessionId: z.string(),
  nextQuestion: z
    .object({
      key: z.string(),
      question: z.string(),
      required: z.boolean(),
    })
    .nullable(),
});

export const InterviewAnswerResponseSchema = z.object({
  nextQuestion: z
    .object({
      key: z.string(),
      question: z.string(),
      required: z.boolean(),
    })
    .nullable(),
  isComplete: z.boolean(),
});

// ── Approval ──
export const ApprovalSchema = z.object({
  id: z.string(),
  sopId: z.string(),
  versionId: z.string(),
  state: z.enum(APPROVAL_STATES),
  approverUserId: z.string(),
  decidedAt: z.string().nullable(),
  comment: z.string().nullable(),
});

export const CreateApprovalSchema = z.object({
  sopId: z.string(),
  versionId: z.string(),
  approverUserId: z.string(),
});

export const DecideApprovalSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  comment: z.string().max(1000).optional(),
});

// ── Checklist run ──
export const ChecklistRunItemSchema = z.object({
  ord: z.number().int().min(0),
  text: z.string(),
  checked: z.boolean(),
  checkedAt: z.string().nullable(),
});

export const ChecklistRunSchema = z.object({
  id: z.string(),
  sopId: z.string(),
  versionId: z.string(),
  userId: z.string(),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
  itemsJson: z.array(ChecklistRunItemSchema),
});

export const CompleteChecklistRunSchema = z.object({
  items: z.array(ChecklistRunItemSchema),
});

// ── Billing ──
export const BillingPlanResponseSchema = z.object({
  plan: z.enum(PLANS),
  creditsIncluded: z.number(),
  creditsBought: z.number(),
  creditsUsed: z.number(),
  creditsRemaining: z.number(),
  currentPeriod: z.string(),
});

export const StarsWebhookSchema = z.object({
  update_id: z.number(),
  pre_checkout_query: z
    .object({
      id: z.string(),
      from: z.object({ id: z.number() }),
      currency: z.string(),
      total_amount: z.number(),
      invoice_payload: z.string(),
    })
    .optional(),
  message: z
    .object({
      successful_payment: z
        .object({
          currency: z.string(),
          total_amount: z.number(),
          invoice_payload: z.string(),
          telegram_payment_charge_id: z.string(),
          provider_payment_charge_id: z.string(),
        })
        .optional(),
    })
    .optional(),
});

export const WalletPayWebhookSchema = z.object({
  eventId: z.string(),
  eventType: z.string(),
  payload: z.object({
    id: z.number(),
    status: z.string(),
    amount: z.object({
      currencyCode: z.string(),
      amount: z.string(),
    }),
    externalId: z.string(),
    customData: z.string().optional(),
  }),
});

export const TonConfirmSchema = z.object({
  workspaceId: z.string(),
  transactionHash: z.string(),
  planId: z.enum(PLANS),
  amount: z.string(),
});

export const ManualPaymentConfirmSchema = z.object({
  workspaceId: z.string(),
  provider: z.enum(PAYMENT_PROVIDERS),
  externalId: z.string(),
  amount: z.number(),
  currency: z.string(),
  planId: z.enum(PLANS).optional(),
  credits: z.number().optional(),
});

// ── Audit log ──
export const AuditLogSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  actorUserId: z.string(),
  action: z.enum(AUDIT_ACTIONS),
  entityType: z.string(),
  entityId: z.string(),
  metaJson: z.record(z.unknown()).nullable(),
  at: z.string(),
});

export const AuditLogQuerySchema = z.object({
  workspaceId: z.string(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
  action: z.enum(AUDIT_ACTIONS).optional(),
  entityType: z.string().optional(),
});

// ── SOP list query ──
export const SopListQuerySchema = z.object({
  workspaceId: z.string(),
  status: z.enum(SOP_STATUSES).optional(),
  search: z.string().max(100).optional(),
  tag: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
});

// ── Error response ──
export const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

// ── Payment event (internal) ──
export const PaymentEventSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  provider: z.enum(PAYMENT_PROVIDERS),
  status: z.enum(PAYMENT_STATUSES),
  externalId: z.string(),
  amount: z.number(),
  currency: z.string(),
  at: z.string(),
  rawJson: z.record(z.unknown()),
});

// ── AI provider config ──
export const AiProviderConfigSchema = z.object({
  provider: z.enum(['openai', 'custom']).default('openai'),
  apiBaseUrl: z.string().url().default('https://api.openai.com/v1'),
  apiKey: z.string().min(1), // encrypted at rest
  model: z.string().default('gpt-4o-mini'),
});

// ── Usage credits ──
export const UsageCreditsSchema = z.object({
  workspaceId: z.string(),
  periodYyyymm: z.string().regex(/^\d{6}$/),
  creditsIncluded: z.number().int().min(0),
  creditsBought: z.number().int().min(0),
  creditsUsed: z.number().int().min(0),
});

// ── Queue job payloads ──
export const LlmGenerationJobSchema = z.object({
  type: z.literal('llm_generation'),
  sopId: z.string(),
  workspaceId: z.string(),
  interviewSessionId: z.string(),
  userId: z.string(),
  isDelta: z.boolean().default(false),
  previousVersionId: z.string().optional(),
});

export const ExportJobSchema = z.object({
  type: z.literal('export'),
  sopId: z.string(),
  versionId: z.string(),
  workspaceId: z.string(),
  format: z.enum(['html', 'pdf']),
  userId: z.string(),
});

export const DigestJobSchema = z.object({
  type: z.literal('digest'),
  workspaceId: z.string(),
});

export const ReminderJobSchema = z.object({
  type: z.literal('reminder'),
  sopId: z.string(),
  workspaceId: z.string(),
  ownerUserId: z.string(),
});

export const QueueJobSchema = z.discriminatedUnion('type', [
  LlmGenerationJobSchema,
  ExportJobSchema,
  DigestJobSchema,
  ReminderJobSchema,
]);
