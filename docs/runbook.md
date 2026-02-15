# Runbook

## Health checks

- API: `GET /health`
- Logs: worker logs via `wrangler tail`
- Queue backlog: Cloudflare dashboard queue metrics

## Operational incidents

### 1) Telegram webhook failing

1. Verify webhook secret configured and matching `BOT_WEBHOOK_SECRET`.
2. Verify endpoint is `/webhook/telegram`.
3. Re-run `setWebhook` command from deployment guide.

### 2) LLM generation stuck

1. Check queue consumer deployment and queue bindings.
2. Check `DEFAULT_AI_*` values for paid plans.
3. For FREE plan, confirm encrypted BYO key exists in workspace config.

### 3) Payment mismatch

1. Query `payment_events` by `(provider, external_id)`.
2. If pending/unconfirmed, reconcile via `POST /admin/manual_payment_confirm`.
3. Verify plan/credits updated in `workspaces` / `usage_credits`.

### 4) Approval publish blocked

1. Verify workspace `policy_json.strictApprovals` and `requireApprovalForPublish`.
2. Ensure an `APPROVED` row exists in `approvals` for that `(sop_id, version_id)`.

## Security checks (regression pack)

Run:

```bash
pnpm test:security
```

Expected assertions include:
- auth/initData freshness/signature rejection for invalid inputs
- RBAC non-escalation constraints
- webhook/payment idempotency expectations

## Restore & recovery

- Re-apply migrations: `pnpm db:migrate`
- Re-deploy services using deployment steps
- Replay idempotent webhooks safely due `(provider, external_id)` dedupe
