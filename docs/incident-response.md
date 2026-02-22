# Incident Response Playbook

## Severity Levels

| Level             | Definition                                    | Response Time     | Examples                                           |
| ----------------- | --------------------------------------------- | ----------------- | -------------------------------------------------- |
| **P0 — Critical** | Data breach, auth bypass, payment loss        | < 15 min          | Leaked secrets, RBAC bypass, payment double-charge |
| **P1 — High**     | Service down, webhook broken, queue stuck     | < 1 hour          | Worker crash, D1 unreachable, bot unresponsive     |
| **P2 — Medium**   | Degraded performance, partial feature failure | < 4 hours         | Slow AI generation, R2 export failure              |
| **P3 — Low**      | Cosmetic, minor UX issue                      | Next business day | TMA styling glitch, non-critical log noise         |

## Response Procedures

### P0 — Critical Security Incident

#### 1. Contain

- **Immediately** rotate compromised secrets (see [runbook.md → Token Rotation](runbook.md#token-rotation))
- If auth bypass confirmed: revoke `JWT_SECRET` to invalidate all tokens
- If payment issue: disable payment feature flags:
  ```bash
  # Set feature flags to disable payments
  cd apps/worker && wrangler secret put FEATURE_WALLETPAY  # set to "false"
  cd apps/worker && wrangler secret put FEATURE_TON_VERIFICATION  # set to "false"
  ```

#### 2. Assess

- Check `wrangler tail` for the affected worker
- Query D1 for anomalous records:
  ```sql
  SELECT * FROM payment_events WHERE created_at > datetime('now', '-1 hour') ORDER BY created_at DESC;
  SELECT * FROM audit_log WHERE created_at > datetime('now', '-1 hour') ORDER BY created_at DESC;
  ```

#### 3. Remediate

- Deploy hotfix or rollback (see [runbook.md → Rollback Procedure](runbook.md#rollback-procedure))
- Run `pnpm test:security` to verify fix

#### 4. Communicate

- Notify affected users via Telegram bot message
- Document in incident log (below)

---

### P1 — Service Down

#### API Worker Down

1. Check Cloudflare Workers dashboard for errors
2. Run `wrangler tail` to see live error logs
3. If crash loop: rollback to last good deploy
   ```bash
   git checkout <last-good-commit>
   pnpm install --frozen-lockfile
   cd apps/worker && wrangler deploy --minify
   ```
4. Verify health: `curl https://<worker-url>/health`

#### Telegram Webhook Broken

1. Verify webhook is set: `curl https://api.telegram.org/bot$BOT_TOKEN/getWebhookInfo`
2. Check for pending updates: look at `pending_update_count`
3. Re-set webhook:
   ```bash
   curl -s "https://api.telegram.org/bot$BOT_TOKEN/setWebhook" \
     -d "url=https://<worker-url>/webhook/telegram" \
     -d "secret_token=$BOT_WEBHOOK_SECRET" \
     -d "allowed_updates=[\"message\",\"callback_query\",\"pre_checkout_query\"]"
   ```

#### Queue Consumer Stuck

1. Check Cloudflare dashboard → Queues → `sop-jobs` for backlog
2. Check consumer logs: `cd apps/queue-consumer && wrangler tail`
3. If stuck: pause queue, fix consumer, redeploy, resume
4. Messages with `max_retries` exceeded go to dead letter — review manually

#### D1 Database Unreachable

1. Check Cloudflare D1 dashboard for status
2. If region-specific: Cloudflare will auto-recover (edge infrastructure)
3. Meanwhile: API returns 500s — no data loss (D1 is durable)

---

### P2 — Degraded Performance

#### AI Generation Slow/Failing

1. Check if external AI API is responding (BYO key or default)
2. Check queue backlog — generation jobs may be piling up
3. If external API down: inform users, generation will resume when API recovers
4. Queue consumer will retry failed jobs automatically (up to 3 times)

#### R2 Export Failure

1. Check R2 bucket in Cloudflare dashboard
2. Verify bucket name matches `sop-builder-exports`
3. Re-trigger export from admin panel

---

## Rollback Decision Matrix

| Scenario                  | Action                                              |
| ------------------------- | --------------------------------------------------- |
| Worker crash after deploy | Rollback to previous commit                         |
| D1 migration broke data   | Create reverse migration, deploy                    |
| TMA web broken            | Cloudflare Pages → rollback to previous deployment  |
| Payment double-charge     | Disable payment flags, investigate, refund manually |
| Secret leaked             | Rotate ALL potentially exposed secrets immediately  |

## Post-Incident

1. **Within 24 hours**: Write incident report
   - Timeline of events
   - Root cause analysis
   - What went well / what could improve
   - Action items with owners

2. **Within 1 week**: Implement preventive measures
   - Add regression test for the failure mode
   - Update runbook/this document if procedures were unclear
   - Review alerting gaps

## Incident Log Template

```markdown
## Incident: [SHORT TITLE]

**Date**: YYYY-MM-DD HH:MM UTC
**Severity**: P0/P1/P2/P3
**Duration**: X minutes/hours
**Impact**: [What users experienced]

### Timeline

- HH:MM — [Event]
- HH:MM — [Detection]
- HH:MM — [Response]
- HH:MM — [Resolution]

### Root Cause

[Detailed explanation]

### Action Items

- [ ] [Action] — Owner — Due date
```

## Contacts

| Role                    | Contact                             |
| ----------------------- | ----------------------------------- |
| On-call engineer        | Telegram @[your-handle]             |
| Cloudflare support      | https://dash.cloudflare.com/support |
| Telegram Bot API issues | https://t.me/BotSupport             |
