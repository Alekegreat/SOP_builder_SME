id: "POST_DEPLOY_SMOKE_PROMPT_CLOUDFLARE_ONLY_V1"
POST_DEPLOY_SMOKE_PROMPT:
  role: >
    Act as Senior DevOps + Senior QA + Senior Security Engineer.
    Run a production post-deploy smoke verification for the SOP Builder system deployed on Cloudflare Pages + Workers + D1 + R2 + Queues.
    Be strict: fail fast, produce evidence, and recommend rollback when necessary.

  scope:
    environment: "PRODUCTION"
    contract: "Local → Preview → Production (no staging)"
    hard_constraints:
      - "No destructive tests on production data except in a dedicated test workspace."
      - "No leaking secrets in logs or outputs."
      - "All checks must be reproducible via commands + recorded outputs."

  inputs_required_from_operator:
    # The agent must ask the operator ONLY for these, then proceed.
    - name: PROD_TMA_URL
      example: "https://<project>.pages.dev or https://app.<domain>"
    - name: PROD_API_URL
      example: "https://<worker>.<account>.workers.dev or https://api.<domain>"
    - name: PROD_DOMAIN
      example: "app.<domain> (optional if using pages.dev only)"
    - name: TELEGRAM_BOT_USERNAME
      example: "@YourSOPBot"
    - name: TELEGRAM_TEST_USER_ID
      example: "numeric telegram user id used for smoke"
    - name: TELEGRAM_ADMIN_USER_ID
      example: "numeric telegram user id as owner/admin"
    - name: FEATURE_FLAGS
      example: |
        {
          "PAYMENTS_AUTOMATED": false,
          "SERVER_PDF_EXPORT": false
        }
    - name: OPTIONAL_PAYMENT_TEST_MODE
      example: |
        {
          "STARS": "manual",
          "WALLETPAY": "manual",
          "TON": "manual"
        }

  artifacts:
    output_folder: "reports/post_deploy_smoke/"
    required_files:
      - "reports/post_deploy_smoke/SMOKE_SUMMARY.md"
      - "reports/post_deploy_smoke/SMOKE_EVIDENCE.log"
      - "reports/post_deploy_smoke/SMOKE_CHECKLIST.json"

  global_pass_fail:
    pass_condition: "All critical checks pass."
    fail_condition: "Any critical check fails OR security regression indicates exploitable path."
    on_fail:
      - "Recommend immediate rollback to previous known-good Worker/Pages deployments."
      - "Disable risky feature flags (PAYMENTS_AUTOMATED, PUBLISH_WITHOUT_APPROVAL, etc.)."
      - "Open incident doc entry with exact failing step + evidence."

  check_levels:
    critical:
      - "DNS/TLS/HTTPS reachable"
      - "API health + auth working"
      - "Bot webhook working"
      - "RBAC enforced server-side"
      - "Approval policy enforced"
      - "Job queue processing works"
      - "Payment webhook idempotency (even in manual mode) works"
    important:
      - "Rate limiting active"
      - "Audit log writes"
      - "R2 read/write for exports/attachments (if enabled)"
      - "Cron reminders enabled (or explicitly disabled by feature flag)"
    optional:
      - "Server PDF export (if enabled)"
      - "Onchain TON confirmation automation (if enabled)"

  steps:
    - step: 0
      name: "Initialize smoke workspace + logging"
      actions:
        - "Create output files and start logging timestamps."
        - "Record deploy identifiers (Git SHA, CF deployment ID if available)."
        - "Confirm FEATURE_FLAGS and payment mode."
      evidence:
        - "Write config snapshot into SMOKE_CHECKLIST.json."

    - step: 1
      name: "DNS + TLS + HTTP basics (critical)"
      actions:
        - "curl -I ${PROD_TMA_URL} and ${PROD_API_URL}"
        - "Verify 200/301/302 expected; no 525/526; HSTS optional."
        - "If PROD_DOMAIN provided: verify it resolves and serves same app."
      pass_criteria:
        - "TMA URL reachable over HTTPS."
        - "API URL reachable over HTTPS."
      fail_fast: true

    - step: 2
      name: "Pages build sanity (critical)"
      actions:
        - "Load TMA main page and ensure it renders without fatal JS errors."
        - "Check that TMA is configured to call PROD_API_URL (not preview/local)."
      pass_criteria:
        - "No blocking console errors."
        - "Network calls go to PROD_API_URL."
      fail_fast: true

    - step: 3
      name: "API health endpoints (critical)"
      actions:
        - "GET ${PROD_API_URL}/health (or /status) if implemented."
        - "GET ${PROD_API_URL}/version to confirm build SHA if implemented."
        - "Confirm JSON error format is consistent."
      pass_criteria:
        - "Health returns ok:true (or equivalent)."
      fail_fast: true

    - step: 4
      name: "Telegram WebApp initData authentication (critical)"
      actions:
        - "Use Playwright smoke (or scripted request) to open TMA inside Telegram context if available."
        - "If Telegram context not available in CI: use a captured initData sample from operator for PROD and run POST /auth/telegram."
        - "Test negative cases: stale auth_date, tampered hash → must reject."
      pass_criteria:
        - "Valid initData returns accessToken."
        - "Tampered/stale initData rejected with 401/403."
      fail_fast: true
      notes:
        - "Do NOT log full initData; redact in evidence."

    - step: 5
      name: "Bot webhook + basic commands (critical)"
      actions:
        - "From TELEGRAM_TEST_USER_ID, run /start and verify response."
        - "Run /new_sop and verify interview starts (one question per message)."
        - "Run /my_sops and ensure it returns list (may be empty)."
      pass_criteria:
        - "Bot responds within acceptable time (P95 < 3s for bot messages)."
      fail_fast: true

    - step: 6
      name: "Create SOP via interview → enqueue generation (critical)"
      actions:
        - "Complete minimal interview (5–8 answers)."
        - "Trigger generation (bot button or /generate)."
        - "Verify job is queued, processed, and a new SOP version appears in TMA Library."
      pass_criteria:
        - "SOP draft version exists in DB and is visible in TMA."
        - "No duplicate version created for same interview session."
      fail_fast: true

    - step: 7
      name: "Approval gating (critical)"
      actions:
        - "Enable strict approval policy in test workspace (or verify it is enabled)."
        - "Attempt publish as Editor without approval → must fail."
        - "Send approval request to Approver; approve; then publish succeeds."
      pass_criteria:
        - "Strict policy blocks publish until approval."
        - "Audit log captures decision with actor + timestamp."
      fail_fast: true

    - step: 8
      name: "RBAC isolation (critical)"
      actions:
        - "Create 2 workspaces: WS_A and WS_B (test-only)."
        - "Ensure user in WS_A cannot read SOPs/audit logs in WS_B via direct API calls."
        - "Attempt role escalation: Viewer attempts Editor/Approver routes → must 403."
      pass_criteria:
        - "No cross-workspace data access."
        - "Server-side RBAC enforced on every tested route."
      fail_fast: true

    - step: 9
      name: "Rate limiting (important)"
      actions:
        - "Burst interview answer endpoint and generate endpoint (e.g., 30 req/min)."
        - "Confirm 429 and backoff headers if implemented."
      pass_criteria:
        - "Rate limits trigger predictably; system remains responsive."

    - step: 10
      name: "Audit log integrity (important)"
      actions:
        - "Verify audit logs exist for: SOP create, version generate, approval decision, publish."
        - "Export audit logs for test workspace (if feature exists) or fetch via API."
      pass_criteria:
        - "Audit events present with correct entity ids and actors."

    - step: 11
      name: "Payment webhooks idempotency + safety (critical)"
      actions:
        - "Run webhook handlers in TEST/MANUAL mode only unless operator explicitly enables automation."
        - "Send the same payment event payload 5x with same external_id → only one credit/plan upgrade event recorded."
        - "Verify signature/verification behavior:"
        - "  - If verification implemented: invalid signature rejected."
        - "  - If feature-flagged manual verification: event recorded as pending and requires admin confirm."
      pass_criteria:
        - "Idempotency holds (unique constraint by provider+external_id)."
        - "No free upgrade via replay."
      fail_fast: true

    - step: 12
      name: "Storage (R2) read/write (important; optional if disabled)"
      conditional_on_feature: "SERVER_PDF_EXPORT == true OR attachments enabled"
      actions:
        - "Upload a small attachment and retrieve it."
        - "Generate an export artifact and confirm it exists in R2."
      pass_criteria:
        - "R2 operations succeed; access control enforced."

    - step: 13
      name: "Cron jobs: digests + stale reminders (important)"
      actions:
        - "Verify cron trigger deployed (or explicitly disabled)."
        - "If runnable: simulate cron endpoint and confirm it enqueues reminder messages without spamming."
      pass_criteria:
        - "Cron exists and does not error."

    - step: 14
      name: "Observability sanity (important)"
      actions:
        - "Check Worker logs (wrangler tail or dashboard) for errors during smoke."
        - "Confirm errors include request id / workspace id but not secrets."
      pass_criteria:
        - "No P0/P1 errors; logs are structured."

    - step: 15
      name: "Rollback readiness (critical)"
      actions:
        - "Confirm the previous deployment artifacts exist (Pages + Workers)."
        - "Document exact rollback steps in SMOKE_SUMMARY.md."
      pass_criteria:
        - "Rollback instructions are explicit and actionable."
      fail_fast: true

  tooling_guidance:
    preferred:
      - "curl"
      - "Playwright smoke test (minimal) hitting PROD URLs"
      - "wrangler tail (manual) for log review"
    required_redaction:
      - "Never print bot token, initData, encryption keys, payment secrets."

  output_requirements:
    SMOKE_SUMMARY_md_must_include:
      - "Exact URLs tested"
      - "Feature flags"
      - "Test workspace identifiers"
      - "Pass/fail per step with timestamps"
      - "Rollback recommendation (even if pass, state rollback path)"
    SMOKE_EVIDENCE_log_must_include:
      - "curl outputs (headers + status)"
      - "API responses with sensitive parts redacted"
      - "Playwright run summary"
    SMOKE_CHECKLIST_json_must_include:
      - "step_results[] with pass/fail, evidence pointers, and notes"

  final_acceptance_statement:
    when_all_pass:
      - "State: READY FOR USERS"
      - "List any known limitations (e.g., payments manual mode)"
    when_any_fail:
      - "State: DO NOT SHIP"
      - "Top 3 root causes suspected + immediate mitigations"
      - "Rollback plan"
