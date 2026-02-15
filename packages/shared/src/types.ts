import { z } from 'zod';
import type {
  TelegramAuthSchema,
  AuthResponseSchema,
  UserSchema,
  WorkspaceSchema,
  WorkspacePolicySchema,
  MembershipSchema,
  SopSchema,
  SopVersionSchema,
  SopContentSchema,
  SopStepSchema,
  SopCheckItemSchema,
  SopExceptionSchema,
  InterviewSessionSchema,
  InterviewTranscriptEntrySchema,
  InterviewAnswerSchema,
  InterviewStartResponseSchema,
  InterviewAnswerResponseSchema,
  ApprovalSchema,
  ChecklistRunSchema,
  ChecklistRunItemSchema,
  BillingPlanResponseSchema,
  AuditLogSchema,
  AuditLogQuerySchema,
  ErrorResponseSchema,
  PaymentEventSchema,
  AiProviderConfigSchema,
  UsageCreditsSchema,
  SopListQuerySchema,
  CreateSopSchema,
  UpdateSopSchema,
  CreateApprovalSchema,
  DecideApprovalSchema,
  CompleteChecklistRunSchema,
  ManualPaymentConfirmSchema,
  TonConfirmSchema,
  QueueJobSchema,
  LlmGenerationJobSchema,
  ExportJobSchema,
  DigestJobSchema,
  ReminderJobSchema,
} from './schemas.js';

// ── Inferred types ──
export type TelegramAuth = z.infer<typeof TelegramAuthSchema>;
export type AuthResponse = z.infer<typeof AuthResponseSchema>;
export type User = z.infer<typeof UserSchema>;
export type Workspace = z.infer<typeof WorkspaceSchema>;
export type WorkspacePolicy = z.infer<typeof WorkspacePolicySchema>;
export type Membership = z.infer<typeof MembershipSchema>;
export type Sop = z.infer<typeof SopSchema>;
export type SopVersion = z.infer<typeof SopVersionSchema>;
export type SopContent = z.infer<typeof SopContentSchema>;
export type SopStep = z.infer<typeof SopStepSchema>;
export type SopCheckItem = z.infer<typeof SopCheckItemSchema>;
export type SopException = z.infer<typeof SopExceptionSchema>;
export type InterviewSession = z.infer<typeof InterviewSessionSchema>;
export type InterviewTranscriptEntry = z.infer<typeof InterviewTranscriptEntrySchema>;
export type InterviewAnswer = z.infer<typeof InterviewAnswerSchema>;
export type InterviewStartResponse = z.infer<typeof InterviewStartResponseSchema>;
export type InterviewAnswerResponse = z.infer<typeof InterviewAnswerResponseSchema>;
export type Approval = z.infer<typeof ApprovalSchema>;
export type ChecklistRun = z.infer<typeof ChecklistRunSchema>;
export type ChecklistRunItem = z.infer<typeof ChecklistRunItemSchema>;
export type BillingPlanResponse = z.infer<typeof BillingPlanResponseSchema>;
export type AuditLog = z.infer<typeof AuditLogSchema>;
export type AuditLogQuery = z.infer<typeof AuditLogQuerySchema>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
export type PaymentEvent = z.infer<typeof PaymentEventSchema>;
export type AiProviderConfig = z.infer<typeof AiProviderConfigSchema>;
export type UsageCredits = z.infer<typeof UsageCreditsSchema>;
export type SopListQuery = z.infer<typeof SopListQuerySchema>;
export type CreateSop = z.infer<typeof CreateSopSchema>;
export type UpdateSop = z.infer<typeof UpdateSopSchema>;
export type CreateApproval = z.infer<typeof CreateApprovalSchema>;
export type DecideApproval = z.infer<typeof DecideApprovalSchema>;
export type CompleteChecklistRun = z.infer<typeof CompleteChecklistRunSchema>;
export type ManualPaymentConfirm = z.infer<typeof ManualPaymentConfirmSchema>;
export type TonConfirm = z.infer<typeof TonConfirmSchema>;
export type QueueJob = z.infer<typeof QueueJobSchema>;
export type LlmGenerationJob = z.infer<typeof LlmGenerationJobSchema>;
export type ExportJob = z.infer<typeof ExportJobSchema>;
export type DigestJob = z.infer<typeof DigestJobSchema>;
export type ReminderJob = z.infer<typeof ReminderJobSchema>;

// ── Utility types ──
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface JwtPayload {
  sub: string; // user id
  tgId: number; // telegram user id
  name: string;
  iat: number;
  exp: number;
}

export interface WorkspaceContext {
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
}

import type { WorkspaceRole, Plan, SopStatus, ApprovalState, InterviewState } from './constants.js';

export type { WorkspaceRole, Plan, SopStatus, ApprovalState, InterviewState };
