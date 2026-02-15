# SOP Builder (Interview-to-SOP + Versioning)

Cloudflare-first Telegram Bot + Telegram Mini App SaaS for creating, approving, versioning, and retaining SOPs.

## Pricing & entitlements

- `FREE` (BYO-AI key): 1 workspace, 10 SOPs, basic history, watermark exports, limited approvals.
- `SOLO_PRO` ($12/mo): 100 SOPs, diffs, review cycles, clean exports, limited included credits.
- `TEAM` ($39/mo): up to 10 members, approvals workflow, RBAC, analytics, templates.
- `BUSINESS` ($99/mo): advanced RBAC, multi-stage approvals, audit exports, retention policies.
- Add-ons: AI credit packs and consultant/agency (multi-client workspaces).

## Stack

- `apps/worker`: Cloudflare Worker API + Bot webhook (`Hono`)
- `apps/queue-consumer`: Cloudflare Queue consumer for async generation/export/reminders
- `apps/tma-web`: Telegram Mini App (`React + Vite + TypeScript`)
- `packages/shared`: shared zod schemas/types/constants
- `packages/engine`: interview FSM, diff, semver, staleness, prompt builder
- `D1` for SQL storage, `R2` for exports/attachments

## Security controls

- Telegram `initData` signature + freshness validation
- Telegram webhook secret validation
- server-side RBAC on protected routes
- per-user rate limits for interview/generation/auth
- idempotent payment processing by `(provider, external_id)`
- generation enqueue dedupe by `(workspaceId, sopId, interviewSessionId)`

## Scripts

- `pnpm dev`
- `pnpm build`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test` / `pnpm test:unit`
- `pnpm test:integration`
- `pnpm test:e2e`
- `pnpm test:security`

## Setup

1. Install: `pnpm install`
2. Configure env files:
   - `apps/worker/.env.example` -> `apps/worker/.dev.vars`
   - `apps/queue-consumer/.env.example` -> `apps/queue-consumer/.dev.vars`
   - `apps/tma-web/.env.example` -> `apps/tma-web/.env`
3. Run all apps: `pnpm dev`

## Docs

- System design: `docs/system-design.md`
- Deployment guide: `docs/deployment-guide.md`
- Operations runbook: `docs/runbook.md`
- Repo structure: `docs/repo-structure.md`
