<!-- markdownlint-disable -->

# SOP Builder — System Design

## 1. Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                        Telegram Platform                         │
│  ┌────────────┐   ┌──────────────────────────────────────────┐  │
│  │  Bot Chat   │   │  Telegram Mini App (WebApp)              │  │
│  │  (grammY)   │   │  React + Vite + @twa-dev/sdk            │  │
│  └──────┬──────┘   └──────────────────┬───────────────────────┘  │
│         │ webhook                     │ initData + REST          │
└─────────┼─────────────────────────────┼──────────────────────────┘
          │                             │
          ▼                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              Cloudflare Worker  (Hono Router)                    │
│                                                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────────┐  │
│  │ Bot      │ │ Auth     │ │ API      │ │ Payment           │  │
│  │ Handler  │ │ Service  │ │ Routes   │ │ Service           │  │
│  │ /webhook │ │ initData │ │ /sops/*  │ │ Stars/TON/Wallet  │  │
│  └──────────┘ │ JWT      │ │ /approvals│└───────────────────┘  │
│               └──────────┘ │ /billing  │                        │
│                            │ /admin    │                        │
│    ┌───────────────────┐   └──────────┘                        │
│    │ RBAC Middleware   │                                        │
│    │ Rate Limiter      │                                        │
│    │ Idempotency Guard │                                        │
│    └───────────────────┘                                        │
│              │                                                   │
│         ┌────┴────┐                                              │
│         ▼         ▼                                              │
│  ┌──────────┐ ┌──────────┐                                      │
│  │ D1 (SQL) │ │ R2 Bucket│                                      │
│  └──────────┘ └──────────┘                                      │
│         │                                                        │
│         ▼                                                        │
│  ┌──────────────────┐                                            │
│  │ Cloudflare Queue  │──▶ Queue Consumer Worker                  │
│  │ (async jobs)      │   ┌─────────────────────┐                 │
│  └──────────────────┘   │ LLM Generation Job  │                 │
│                          │ PDF Export Job      │                 │
│                          │ Digest/Reminder Job │                 │
│                          └─────────────────────┘                 │
└─────────────────────────────────────────────────────────────────┘

┌────────────────────────┐
│  Cloudflare Pages      │
│  TMA Static Assets     │
│  (React SPA)           │
└────────────────────────┘
```

## 2. Data Flow

### Interview-to-SOP Flow

1. **User** → `/new_sop` bot command or TMA "New SOP" button
2. **Bot/TMA** → `POST /sops` → creates SOP record (status=DRAFT)
3. **Bot/TMA** → `POST /sops/:id/interview/start` → creates `interview_session`
4. **Interview FSM** sends questions one at a time via bot messages or TMA UI
5. **User answers** → `POST /sops/:id/interview/answer` → stores in transcript_json
6. After all questions → `POST /sops/:id/generate` → enqueues LLM job on CF Queue
7. **Queue Consumer** → calls LLM API → generates SOP JSON + markdown
8. **Consumer** → stores `sop_version` (v1.0) in D1 → sends Telegram notification
9. **User** views version in TMA with full SOP structure

### Approval Flow

1. SOP owner clicks "Submit for Review" → status = IN_REVIEW
2. Approvers get notified (bot + TMA inbox)
3. Approver clicks Approve/Reject → `POST /approvals/:id/decide`
4. If approved → status = APPROVED → can publish
5. If workspace policy = strict → publishing requires approval
6. Published SOP → status = PUBLISHED, previous = SUPERSEDED

### Payment Flow

1. **Stars**: Bot sends invoice → user pays → Telegram callback → `POST /billing/stars/webhook` → idempotent upsert
2. **TON Connect**: TMA integrates TON Connect UI → user signs tx → `POST /billing/ton/confirm` → backend verifies on-chain
3. **Wallet Pay**: TMA redirects → webhook `POST /billing/walletpay/webhook` → idempotent processing

### Retention Flow

1. **Cron Trigger** (daily) → scans SOPs where `next_review_at < now()`
2. Calculates staleness score per SOP
3. Sends reminders to SOP owner via bot
4. Weekly digest: aggregated stats → bot message
5. "Re-interview delta" button → starts interview with pre-filled previous answers

## 3. Threat Model

| Threat                    | Mitigation                                                                                          |
| ------------------------- | --------------------------------------------------------------------------------------------------- |
| Forged initData           | HMAC-SHA256 validation of Telegram WebApp initData using bot token; reject if auth_date > 5 min old |
| Webhook replay            | Idempotency key (provider + externalId) on all payment webhooks; dedup in DB                        |
| RBAC escalation           | Server-side role check on every API route via middleware; never trust client role claims            |
| Prompt injection          | User inputs treated as data-only in LLM prompts; system prompt with safety rails; output validation |
| Unauthorized bot commands | Validate telegram user_id matches authenticated session                                             |
| Rate abuse                | Per-user per-minute rate limits on interview answers and generation triggers                        |
| API key theft (BYO)       | Encrypt BYO API keys at rest using workspace-scoped encryption; never log keys                      |
| CSRF on TMA               | initData validation on every request; JWT with short expiry                                         |
| Data exfiltration         | RBAC prevents cross-workspace access; all queries scoped by workspace_id                            |
| DDoS on Worker            | Cloudflare's built-in DDoS protection; rate limiting middleware                                     |

## 4. Component Responsibilities

### Bot Service

- Handles Telegram updates via webhook
- Commands: /start, /new_sop, /my_sops, /my_tasks, /approve, /update_sop, /billing
- Interview FSM: stateful conversation, 1 question per message
- Inline keyboards for approvals

### Auth Service

- Validates Telegram WebApp initData (HMAC-SHA256)
- Issues JWT access tokens (short-lived, 1h)
- Refresh via re-validation of initData

### SOP Engine

- Interview FSM state machine
- SOP prompt builder (structured output)
- Semantic version bump logic
- Diff generation between versions
- Staleness score calculation

### Payment Service

- Stars invoice creation + webhook handling
- TON Connect transaction verification
- Wallet Pay webhook processing
- All webhooks are idempotent
- Credit accounting per workspace

### Queue Consumer

- LLM generation (with provider adapter)
- HTML/PDF export to R2
- Scheduled digest and reminder generation

## 5. Entitlements Matrix

| Feature            | FREE           | SOLO PRO      | TEAM           | BUSINESS        |
| ------------------ | -------------- | ------------- | -------------- | --------------- |
| Workspaces         | 1              | 1             | 3              | 10              |
| SOPs               | 10             | 100           | 500            | Unlimited       |
| Members            | 1              | 1             | 10             | 50              |
| AI                 | BYO key only   | 50 credits/mo | 200 credits/mo | 1000 credits/mo |
| Version history    | Basic (last 5) | Full          | Full           | Full            |
| Diffs              | ❌             | ✅            | ✅             | ✅              |
| Review cycles      | ❌             | ✅            | ✅             | ✅              |
| Approval workflow  | Basic          | Basic         | Full           | Multi-stage     |
| Exports            | Watermark      | Clean         | Clean          | Clean + Audit   |
| Analytics          | ❌             | Basic         | Full           | Full + API      |
| RBAC               | ❌             | ❌            | Standard       | Advanced        |
| Audit logs         | ❌             | ❌            | 30 days        | Unlimited       |
| Templates          | Community      | Community     | Custom         | Custom + Share  |
| Retention policies | ❌             | ❌            | ❌             | ✅              |
