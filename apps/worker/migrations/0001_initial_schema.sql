-- Migration: 0001_initial_schema.sql
-- Creates all tables for SOP Builder

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  telegram_user_id INTEGER NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  plan TEXT NOT NULL DEFAULT 'FREE',
  policy_json TEXT NOT NULL DEFAULT '{}',
  ai_config_json TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memberships (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL DEFAULT 'viewer',
  PRIMARY KEY (workspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS sops (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  current_version_id TEXT,
  next_review_at TEXT,
  tags_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sop_versions (
  id TEXT PRIMARY KEY,
  sop_id TEXT NOT NULL REFERENCES sops(id),
  semver TEXT NOT NULL,
  change_summary TEXT NOT NULL DEFAULT '',
  content_json TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sop_steps (
  id TEXT PRIMARY KEY,
  version_id TEXT NOT NULL REFERENCES sop_versions(id),
  ord INTEGER NOT NULL,
  text TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sop_checkitems (
  id TEXT PRIMARY KEY,
  version_id TEXT NOT NULL REFERENCES sop_versions(id),
  ord INTEGER NOT NULL,
  text TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sop_exceptions (
  id TEXT PRIMARY KEY,
  version_id TEXT NOT NULL REFERENCES sop_versions(id),
  ord INTEGER NOT NULL,
  text TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS interview_sessions (
  id TEXT PRIMARY KEY,
  sop_id TEXT NOT NULL REFERENCES sops(id),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  state TEXT NOT NULL DEFAULT 'NOT_STARTED',
  transcript_json TEXT NOT NULL DEFAULT '[]',
  current_question_index INTEGER NOT NULL DEFAULT 0,
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  sop_id TEXT NOT NULL REFERENCES sops(id),
  version_id TEXT NOT NULL REFERENCES sop_versions(id),
  state TEXT NOT NULL DEFAULT 'PENDING',
  approver_user_id TEXT NOT NULL REFERENCES users(id),
  decided_at TEXT,
  comment TEXT
);

CREATE TABLE IF NOT EXISTS checklist_runs (
  id TEXT PRIMARY KEY,
  sop_id TEXT NOT NULL REFERENCES sops(id),
  version_id TEXT NOT NULL REFERENCES sop_versions(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  items_json TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  mime TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  actor_user_id TEXT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  meta_json TEXT,
  at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS billing_customers (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  provider TEXT NOT NULL,
  external_customer_id TEXT NOT NULL,
  PRIMARY KEY (workspace_id, provider)
);

CREATE TABLE IF NOT EXISTS payment_events (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  provider TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  external_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL,
  at TEXT NOT NULL,
  raw_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS usage_credits (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  period_yyyymm TEXT NOT NULL,
  credits_included INTEGER NOT NULL DEFAULT 0,
  credits_bought INTEGER NOT NULL DEFAULT 0,
  credits_used INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (workspace_id, period_yyyymm)
);

CREATE TABLE IF NOT EXISTS daily_metrics (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  date TEXT NOT NULL,
  sops_created INTEGER NOT NULL DEFAULT 0,
  versions_created INTEGER NOT NULL DEFAULT 0,
  interviews_completed INTEGER NOT NULL DEFAULT 0,
  approvals_decided INTEGER NOT NULL DEFAULT 0,
  checklist_runs_completed INTEGER NOT NULL DEFAULT 0,
  credits_used INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (workspace_id, date)
);

CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sops_workspace ON sops(workspace_id);
CREATE INDEX IF NOT EXISTS idx_sops_status ON sops(status);
CREATE INDEX IF NOT EXISTS idx_sops_owner ON sops(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_sop_versions_sop ON sop_versions(sop_id);
CREATE INDEX IF NOT EXISTS idx_interview_sessions_sop ON interview_sessions(sop_id);
CREATE INDEX IF NOT EXISTS idx_approvals_sop ON approvals(sop_id);
CREATE INDEX IF NOT EXISTS idx_approvals_approver ON approvals(approver_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_workspace ON audit_logs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_at ON audit_logs(at);
CREATE INDEX IF NOT EXISTS idx_payment_events_external ON payment_events(provider, external_id);
CREATE INDEX IF NOT EXISTS idx_checklist_runs_sop ON checklist_runs(sop_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_events_dedup ON payment_events(provider, external_id);
