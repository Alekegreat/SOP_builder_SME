# Deployment Guide (Cloudflare-first)

## 1) Prerequisites

- Node 20+
- pnpm 9+
- Cloudflare account with `Workers`, `D1`, `R2`, `Queues`, `Pages`
- Telegram bot token from BotFather

## 2) Provision Cloudflare resources

Create:
- Worker service for `apps/worker`
- Worker service for `apps/queue-consumer`
- D1 database (e.g. `sop-builder-db`)
- R2 bucket (e.g. `sop-builder-exports`)
- Queue (producer bound to `apps/worker`, consumer bound to `apps/queue-consumer`)
- Pages project for `apps/tma-web`

## 3) Environment templates

### apps/worker
Use `apps/worker/.env.example` and set as Worker secrets/vars:
- `BOT_TOKEN`
- `BOT_WEBHOOK_SECRET`
- `JWT_SECRET`
- `ENCRYPTION_KEY`
- optional: `DEFAULT_AI_API_BASE`, `DEFAULT_AI_API_KEY`, `DEFAULT_AI_MODEL`
- optional feature flags: `FEATURE_TON_VERIFICATION`, `FEATURE_WALLETPAY`, `FEATURE_PDF_EXPORT`
- optional TON: `TON_API_ENDPOINT`, `TON_API_KEY`
- optional Wallet Pay: `WALLETPAY_API_KEY`, `WALLETPAY_WEBHOOK_SECRET`

### apps/queue-consumer
Use `apps/queue-consumer/.env.example`.

### apps/tma-web
Use `apps/tma-web/.env.example`:
- `VITE_API_URL=https://<worker-domain>`

## 4) Database migration

```bash
pnpm install
pnpm db:migrate
```

## 5) Deploy

```bash
# Worker API + webhook
pnpm --filter @sop/worker deploy

# Queue consumer
pnpm --filter @sop/queue-consumer deploy

# TMA web build and Pages deploy
pnpm --filter @sop/tma-web build
# then deploy dist via wrangler pages deploy
```

## 6) Telegram webhook

Set webhook to Worker endpoint:

```bash
curl -s "https://api.telegram.org/bot$BOT_TOKEN/setWebhook" \
  -d "url=https://<worker-domain>/webhook/telegram" \
  -d "secret_token=$BOT_WEBHOOK_SECRET" \
  -d "allowed_updates=[\"message\",\"callback_query\",\"pre_checkout_query\"]"
```

## 7) TON / Wallet Pay modes

- Provider mode: enable feature flags and provider secrets.
- Manual fallback mode: keep feature disabled and use `POST /admin/manual_payment_confirm` for reconciliation.
