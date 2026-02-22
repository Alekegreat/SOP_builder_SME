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

## Rollback procedure

If a deploy causes issues:

1. **Identify failing service**: Check `wrangler tail` logs for the affected worker.
2. **Roll back Worker**: Re-deploy previous version from CI or local checkout:
   ```bash
   git checkout <last-good-commit>
   pnpm install --frozen-lockfile
   pnpm --filter @sop/worker deploy
   pnpm --filter @sop/queue-consumer deploy
   ```
3. **Roll back TMA web**: Cloudflare Pages supports instant rollback from the dashboard (Deployments → select previous deployment → "Rollback to this deploy").
4. **D1 migrations**: D1 migrations are forward-only. If a schema change must be reversed, create a new migration that undoes the change and run `pnpm db:migrate`.
5. **Queue drain**: If queue messages are stuck, pause the queue from the Cloudflare dashboard, fix the consumer, then resume.

## Backup plan (D1 export to R2)

D1 does not have built-in backup export. Use the following approach:

1. **Export D1 to SQL**: Use the Cloudflare dashboard D1 → your database → Export, or via API:
   ```bash
   wrangler d1 export sop-builder-db --remote --output=backup.sql
   ```
2. **Upload to R2**: Store the backup in the R2 bucket:
   ```bash
   wrangler r2 object put sop-builder-exports/backups/$(date +%Y%m%d).sql --file=backup.sql
   ```
3. **Schedule**: Run backups before every production deploy and weekly via a scheduled task or GitHub Action.
4. **Restore**: Import the SQL dump into a new or existing D1 database:
   ```bash
   wrangler d1 execute sop-builder-db --remote --file=backup.sql
   ```

## Token rotation

### Bot token rotation

1. Revoke the old token via BotFather (`/revoke`). This immediately invalidates the old token.
2. Generate a new token via BotFather (`/token`).
3. Update `BOT_TOKEN` secret in Cloudflare Workers (both `worker` and `queue-consumer`):
   ```bash
   cd apps/worker && wrangler secret put BOT_TOKEN
   cd apps/queue-consumer && wrangler secret put BOT_TOKEN
   ```
4. Update `TELEGRAM_BOT_TOKEN` GitHub secret for CI/CD.
5. Re-set the webhook with the new token:
   ```bash
   curl -s "https://api.telegram.org/bot$NEW_BOT_TOKEN/setWebhook" \
     -d "url=https://<worker-domain>/webhook/telegram" \
     -d "secret_token=$BOT_WEBHOOK_SECRET" \
     -d "allowed_updates=[\"message\",\"callback_query\",\"pre_checkout_query\"]"
   ```

### JWT secret rotation

1. Generate a new random secret (≥32 chars).
2. Update `JWT_SECRET` in Cloudflare Worker secrets.
3. All existing JWTs will be invalidated — users will need to re-authenticate via initData.
4. No data loss since auth state is not persisted beyond the JWT.

### Encryption key rotation

1. **Warning**: Changing `ENCRYPTION_KEY` will make all existing encrypted BYO API keys unreadable.
2. To rotate safely, create a migration script that:
   a. Decrypts all keys with the old key.
   b. Re-encrypts with the new key.
   c. Updates the DB.
3. Deploy the new `ENCRYPTION_KEY` after the migration script runs.
