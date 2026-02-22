You are a senior team: CMO+CFO+CSO+CTO+CPO+CKO+Senior Fullstack Dev+Senior QA+Senior DevOps.
Build a production-ready Telegram Bot + Telegram Mini App (TMA) SaaS:

Product: “SOP Builder (interview-to-SOP) + Versioning”
Pain: SOPs don’t exist or become outdated, so teams operate inconsistently.

HARD CONSTRAINTS

- Budget: $0 USD until shipping and retaining the 100th customer.
- You must design for near-zero infra cost: Cloudflare-first deployment.
- Must be test-driven (TDD) + verification-driven: unit + integration + e2e, >=95% coverage.
- Must include pricing, entitlements, and retention loops that make customers stick permanently.
- Must support payments: (1) Telegram Stars, (2) TON wallet via TON Connect, (3) Wallet Pay (USDT).
- Must be secure: webhook validation, initData validation, RBAC, rate limits, idempotent payment webhooks.

OUTPUT FORMAT
Deliver in this exact order:

1. System design (architecture, data flow, threat model)
2. Repo file structure
3. Implementation (all code files)
4. Tests (all test files)
5. CI/CD (GitHub Actions + CodeQL + security regression pack)
6. Deployment guide + runbook
7. Acceptance checklist with commands and expected outputs

OPERATIONAL DEFINITIONS (build exactly this)

- SOP: structured document with fields:
  Purpose, Scope, Roles (Owner/Editor/Approver/Viewer), Preconditions, Tools, Step-by-step steps,
  Checklist items, Exceptions/Edge cases, KPIs/Quality checks, Risks, References.
- Interview-to-SOP: an interview session that asks one question at a time, stores answers,
  and generates a DRAFT SOP using an LLM.
- Versioning: immutable snapshots with semantic versions (v1.0, v1.1, v2.0),
  with diff viewer between versions, change summary, author, timestamp.
- Approval workflow: Draft → InReview → Approved → Published → Superseded/Archived.
  Publishing requires approval when workspace policy = “strict”.
- Retention engine:
  Review cycle per SOP (30/60/90 days), staleness score, Telegram reminders,
  weekly digest, and one-click “re-interview delta” to produce a new version.
- Checklist runs: users can run a checklist (per SOP version), tick items, store runs for analytics.

PRICING & ENTITLEMENTS (implement in code)
Plans:

- FREE (BYO-AI key): 1 workspace, up to 10 SOPs, basic version history, watermark exports, limited approvals.
- SOLO PRO ($12/mo): up to 100 SOPs, diffs, review cycles, clean exports, includes limited AI credits.
- TEAM ($39/mo): up to 10 members, approvals workflow, RBAC, analytics, templates.
- BUSINESS ($99/mo): advanced RBAC, multi-stage approvals, audit exports, retention policies.
  Add-ons:
- Extra AI credits packs.
- Consultant/Agency mode (multi-client workspaces).

Key rule for $0 budget:

- FREE plan must NOT consume our paid LLM credits. It must require BYO-AI key (stored securely).
- Paid plans can include small AI credits. Track usage per workspace and enforce limits.

TECH STACK (use this unless impossible)

- Monorepo: pnpm workspaces, TypeScript everywhere.
- Cloudflare Workers for API + Bot webhook (single entry with routing).
- Cloudflare Queues + Worker consumer for long LLM generation / PDF export tasks.
- Cloudflare D1 (SQLite) for DB.
- Cloudflare R2 for file storage (exports, attachments).
- Frontend TMA: React + Vite + TypeScript.
- Validation: zod schemas shared between FE/BE.
- ORM/DB: drizzle-orm (SQLite/D1 compatible). Include migrations.
- Bot framework: grammY (or Telegraf if grammY not feasible in Workers).
- API routing on Worker: Hono (preferred) or native fetch router.
- Testing: Vitest for unit/integration, Miniflare for Worker tests, Playwright for E2E TMA.
- Lint/format: eslint + prettier.
- Security scanning: CodeQL workflow.
- “security regression pack”: pnpm test:security (auth bypass, webhook replay, RBAC escalation tests).

SYSTEM COMPONENTS (must implement)

1. Bot Service (in Worker): commands + interactive flows
   - /start, /new_sop, /my_sops, /my_tasks, /approve, /update_sop, /billing
   - Interview FSM: 1 question per message, resumeable, cancelable.
2. TMA Web:
   - SOP Library (search/filter/tag), SOP Viewer/Editor, Version History w/diff,
     Approvals Inbox, Roles & Access, Templates, Analytics, Billing, Audit Log.
3. SOP Engine package:
   - Interview FSM, SOP generator prompt builder, semantic version bump logic,
     diff generation, staleness score calculation.
4. Payment service:
   - Stars invoices in bot, success handling.
   - Wallet Pay flow + webhook verification (implement interface + stub if verification specifics unknown; must be idempotent).
   - TON Connect in TMA + backend transaction verification strategy:
     - Support “provider mode” (TON API endpoint configured) and “manual fallback” mode.
5. Auth service:
   - Validate Telegram WebApp initData on backend.
   - Session tokens (JWT) for TMA API calls.
6. Worker jobs:
   - LLM generation job
   - Export job (HTML → PDF) and store to R2
   - Digest/reminders job (scheduled Cron trigger)
7. Admin/Owner controls:
   - Workspace policy: strict approvals on/off
   - AI provider config: BYO keys, credit packs, usage
   - Manual payment reconciliation fallback
8. Observability:
   - Structured logs + error tracking hooks
   - Minimal metrics stored in DB (daily counters) since $0

DATA FLOW (must document and implement)
Telegram chat → Bot webhook → Worker API → D1 (store interview) → Queue job →
LLM generation → store SOP version in D1 → notify user → TMA shows version history.
Approvals: Bot buttons + TMA inbox → approval decision → audit log → publish.

SECURITY REQUIREMENTS (non-negotiable)

- Validate Telegram WebApp initData (signature + auth_date freshness); reject stale.
- Validate webhook source for Telegram bot updates (use secret token if available).
- Rate limit: per user per minute for interview and generation triggers.
- RBAC enforced server-side on every route.
- Idempotency:
  - Payment webhooks must be deduped by (provider, externalId).
  - Job enqueue endpoints must be idempotent by (workspaceId, sopId, interviewSessionId).
- Prevent prompt injection:
  - Treat user input as data; sanitize in prompts; include system safety rails in SOP prompt builder.

EXCEPTIONS / SELF-REGULATION

- If a provider integration cannot be completed without external paid services:
  - Implement it behind a feature flag with a robust interface and a “manual verification” admin fallback.
  - Document exactly what env vars unlock full automation.
- If PDF rendering in Workers is heavy:
  - Default to HTML export + client-side “Print to PDF” in TMA, and keep server PDF as optional job.
- If any component risks exceeding Worker CPU limits:
  - Move it to Queue consumer.

DATABASE (D1) SCHEMA (must implement via migrations)
Tables:

- users (id, telegram_user_id, name, created_at)
- workspaces (id, name, owner_user_id, plan, policy_json, created_at)
- memberships (workspace_id, user_id, role)
- sops (id, workspace_id, title, status, owner_user_id, current_version_id, next_review_at, tags_json)
- sop_versions (id, sop_id, semver, change_summary, content_json, created_by_user_id, created_at)
- sop_steps (id, version_id, ord, text)
- sop_checkitems (id, version_id, ord, text)
- sop_exceptions (id, version_id, ord, text)
- interview_sessions (id, sop_id, workspace_id, state, transcript_json, created_by_user_id, created_at, updated_at)
- approvals (id, sop_id, version_id, state, approver_user_id, decided_at, comment)
- checklist_runs (id, sop_id, version_id, user_id, started_at, completed_at, items_json)
- attachments (id, workspace_id, entity_type, entity_id, r2_key, mime, created_at)
- audit_logs (id, workspace_id, actor_user_id, action, entity_type, entity_id, meta_json, at)
- billing_customers (workspace_id, provider, external_customer_id)
- payment_events (id, workspace_id, provider, status, external_id, amount, currency, at, raw_json)
- usage_credits (workspace_id, period_yyyymm, credits_included, credits_bought, credits_used)

API (REST) REQUIREMENTS

- Use zod for request/response schemas (shared types).
- Return consistent error format: { error: { code, message, details? } }.
  Endpoints (minimum):
  Auth:
- POST /auth/telegram
  SOPs:
- POST /sops
- GET /sops
- GET /sops/:id
- POST /sops/:id/interview/start
- POST /sops/:id/interview/answer
- POST /sops/:id/generate (enqueue)
- GET /sops/:id/versions
- POST /sops/:id/versions/:versionId/publish
  Approvals:
- GET /approvals/inbox
- POST /approvals
- POST /approvals/:id/decide
  Checklists:
- POST /sops/:id/checklist_runs
- POST /checklist_runs/:id/complete
  Billing:
- GET /billing/plan
- POST /billing/stars/webhook
- POST /billing/walletpay/webhook
- POST /billing/ton/confirm
  Admin:
- GET /admin/audit_logs
- POST /admin/manual_payment_confirm

FRONTEND (TMA) REQUIREMENTS

- Telegram WebApp initData auth; store accessToken securely (memory + refresh strategy).
- Pages:
  Library, SOP detail/editor, Version history/diff, Approvals inbox, Roles, Templates, Analytics, Billing, Audit logs.
- Diff viewer: show changed steps/checklist items between versions.
- UX: fast search, tags, “stale” badge, one-click “update SOP” (re-interview delta).

LLM GENERATION (must be robust and cheap)

- Provide pluggable AI provider adapter:
  - OpenAI-compatible API base URL + key
  - Local/offline mode placeholder
- Prompt builder must output:
  - SOP JSON structure + human-readable markdown
  - Checklist
  - Exceptions
  - KPIs
- Must store both structured JSON (for TMA) and markdown (for export).
- Must implement token/credit accounting per workspace.

TESTING REQUIREMENTS (>=95% coverage)
Unit tests:

- semver bump, diff generation, staleness scoring, RBAC rules, interview FSM transitions.
  Integration tests (Miniflare):
- Auth initData validation
- SOP create → interview → enqueue → job result stored
- Approval gating on publish
- Payment webhook idempotency (duplicate events)
  E2E tests (Playwright):
- TMA login → create SOP → view version → request approval → approve → published.

CI/CD REQUIREMENTS
GitHub Actions:

- pnpm install + cache
- lint, typecheck
- test with coverage gate >=95%
- test:integration
- test:e2e (headed off, headless)
- CodeQL workflow
- test:security (security regression pack)
  Deploy:
- Cloudflare Pages (tma-web)
- Cloudflare Worker (api+bot)
- Cloudflare Worker consumer (queue)
- D1 migrations step
  All deployments must be documented in docs/deployment-guide.md with env var templates.

DELIVERABLES MUST INCLUDE

- Full repo code with scripts:
  - pnpm dev, pnpm build, pnpm test, pnpm test:integration, pnpm test:e2e, pnpm test:security
- .env.example files for each app
- docs/deployment-guide.md + docs/runbook.md
- README with product + pricing + setup + commands

NOW BUILD IT. Start with system design, then repo structure, then code.
