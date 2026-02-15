# Repo File Structure

```text
.
├─ apps/
│  ├─ worker/                 # API + Telegram bot webhook (Cloudflare Worker)
│  │  ├─ src/app.ts
│  │  ├─ src/routes/          # auth, sops, approvals, checklists, billing, admin, webhook
│  │  ├─ src/services/        # auth, billing, payments, rbac, audit, ai-provider, encryption, rate-limiter
│  │  ├─ src/middleware/      # auth, error, logger, rbac
│  │  ├─ src/db/schema.ts
│  │  └─ migrations/0001_initial_schema.sql
│  ├─ queue-consumer/         # Queue handlers for llm_generation/export/digest/reminder
│  │  └─ src/handlers/
│  └─ tma-web/                # Telegram Mini App (React)
│     └─ src/pages/           # library, detail, version diff, approvals, roles, templates, analytics, billing, audit
├─ packages/
│  ├─ shared/                 # zod schemas, constants, shared types
│  └─ engine/                 # interview FSM, semver, diff, prompt, staleness, export
├─ tests/
│  ├─ integration/
│  ├─ security/
│  └─ e2e/
├─ .github/workflows/
│  ├─ ci.yml
│  ├─ codeql.yml
│  └─ deploy.yml
└─ docs/
   ├─ system-design.md
   ├─ deployment-guide.md
   └─ runbook.md
```
