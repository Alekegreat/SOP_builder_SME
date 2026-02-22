# Security Documentation

## Architecture Overview

The SOP Builder uses a **Cloudflare-first** architecture with defense-in-depth security:

- **Edge enforcement**: All traffic passes through Cloudflare Workers (DDoS protection, TLS termination)
- **Authentication**: Telegram `initData` HMAC-SHA256 validation → JWT tokens
- **Authorization**: 5-role RBAC (viewer, editor, approver, admin, owner) with 26 fine-grained permissions
- **Encryption**: AES-256-GCM for stored BYO API keys
- **Data isolation**: Workspace-scoped queries; preview namespace isolation for non-production

## Authentication Flow

1. User opens Telegram Mini App (TMA)
2. TMA sends `initData` (signed by Telegram) to `/auth/login`
3. Worker validates HMAC-SHA256 signature with `BOT_TOKEN`
4. Worker verifies `auth_date` freshness (max 5 minutes)
5. Worker issues JWT (HS256) with `{ sub: userId, tgId: telegramUserId, name }`
6. All subsequent requests use `Authorization: Bearer <jwt>`

### Token Lifecycle

- JWT expires after 24 hours
- No refresh tokens — user re-authenticates via TMA launch
- Token invalidation: rotate `JWT_SECRET` (invalidates all tokens)

## Authorization (RBAC)

### Role Hierarchy

| Role         | Level | Key Permissions                                     |
| ------------ | ----- | --------------------------------------------------- |
| **viewer**   | 1     | Read SOPs, read approvals                           |
| **approver** | 2     | Decide approvals, read all                          |
| **editor**   | 3     | Create/edit SOPs, request approvals                 |
| **admin**    | 4     | Delete SOPs, manage members, export                 |
| **owner**    | 5     | Billing, settings, role management, all permissions |

### Permission Matrix

26 permissions across categories: `sop:*`, `approval:*`, `workspace:*`, `admin:*`, `checklist:*`, `analytics:*`

### Enforcement Points

- **Middleware** (`rbac.ts`): Checks `hasPermission(role, action)` before route handlers
- **Service layer**: Double-checks workspace membership for sensitive operations
- **Tests**: Complete escalation matrix tested in `pnpm test:security`

## Encryption

### BYO API Keys (AES-256-GCM)

- Users can provide their own AI API keys for SOP generation
- Keys encrypted at rest using `ENCRYPTION_KEY` (256-bit hex)
- Each encrypted value uses a unique random IV
- Stored format: `iv:ciphertext:authTag` (base64)

### Key Rotation

See [runbook.md](runbook.md#encryption-key-rotation) for rotation procedure.

## Webhook Security

### Telegram Bot Webhook

- Endpoint: `/webhook/telegram`
- Validated via `X-Telegram-Bot-Api-Secret-Token` header matching `BOT_WEBHOOK_SECRET`
- Rejects when `BOT_WEBHOOK_SECRET` is not configured (500 — prevents accidental open webhook)

### Payment Webhooks

- **Stars**: Validated via `BOT_WEBHOOK_SECRET` HMAC
- **WalletPay**: Validated via `WALLETPAY_WEBHOOK_SECRET` signature
- **TON**: On-chain verification via TON API
- All payment events deduplicated by `(provider, external_id)` — replay-safe

## Rate Limiting

D1-based sliding window rate limiter:

| Endpoint Category  | Window | Max Requests                                            |
| ------------------ | ------ | ------------------------------------------------------- |
| `/auth/login`      | 15 min | 20                                                      |
| `/sops/*/generate` | 1 hour | Based on plan (FREE: 3, PRO: 50, ENTERPRISE: unlimited) |
| General API        | 1 min  | 60                                                      |

Exceeding limits returns `429 Too Many Requests`.

## Data Isolation

### Production

- Each workspace has its own data, scoped by `workspace_id` in all queries
- Users can only access workspaces they're members of
- Cross-workspace access prevented by membership check in middleware

### Preview (PR deployments)

- Single D1 database shared between preview and production
- Preview data isolated by `PREVIEW_NAMESPACE` (set to `pr-<number>`)
- Workspace names prefixed with `[pr-N]` in preview
- Namespace enforced in middleware; cross-namespace access rejected
- See `apps/worker/src/middleware/preview-namespace.ts`

## Supply Chain Security

- **Dependency Review**: GitHub Action runs on every PR (`actions/dependency-review-action@v4`)
- **CodeQL**: Weekly scans + on every PR (security-extended queries)
- **Lockfile**: `pnpm install --frozen-lockfile` in CI — no lockfile modifications allowed
- **Engine constraints**: `node >=20.0.0`, `pnpm >=9.0.0`

## Secret Management

| Secret                 | Storage                   | Rotation Guide                                   |
| ---------------------- | ------------------------- | ------------------------------------------------ |
| `BOT_TOKEN`            | Wrangler secrets + GitHub | [runbook.md](runbook.md#bot-token-rotation)      |
| `BOT_WEBHOOK_SECRET`   | Wrangler secrets + GitHub | Regenerate random, update webhook                |
| `JWT_SECRET`           | Wrangler secrets          | [runbook.md](runbook.md#jwt-secret-rotation)     |
| `ENCRYPTION_KEY`       | Wrangler secrets          | [runbook.md](runbook.md#encryption-key-rotation) |
| `CLOUDFLARE_API_TOKEN` | GitHub secrets only       | Revoke + recreate in CF dashboard                |

### Rules

1. **Never commit secrets** — `.dev.vars` is in `.gitignore`
2. **Least privilege API tokens** — Cloudflare token scoped to specific account + permissions
3. **Rotate on exposure** — If any secret appears in logs/chat, rotate immediately

## Security Testing

Run the full security regression pack:

```bash
pnpm test:security
```

### Test Categories

1. **RBAC escalation** — Every role pair tested for privilege escalation
2. **Telegram initData tampering** — Bad hash, wrong token, stale timestamp
3. **Prompt injection resistance** — Malicious input cannot override system role
4. **Encryption correctness** — AES-256-GCM encrypt/decrypt, wrong key rejection
5. **JWT security** — Expiry, wrong secret, malformed tokens
6. **Rate limit enforcement** — Sliding window, burst detection
7. **Payment idempotency** — Duplicate webhook dedup by (provider, external_id)
8. **Webhook replay** — Same update_id detected and rejected
9. **Job enqueue dedup** — Same session cannot create duplicate versions
10. **Version immutability** — Published versions cannot be modified
11. **Preview namespace isolation** — Cross-PR data access prevented

## Incident Response

See [incident-response.md](incident-response.md) for the full incident response playbook.
