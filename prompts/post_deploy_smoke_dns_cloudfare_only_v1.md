id: "POST_DEPLOY_SMOKE_DNS_CLOUDFLARE_ONLY_V1"
POST_DEPLOY_SMOKE_DNS_CLOUDFLARE_ONLY_PROMPT:
  role: >
    Act as Senior DevOps + Senior Security Engineer.
    Perform a Cloudflare DNS/TLS/Redirects smoke verification for a Telegram Bot + TMA system:
    Cloudflare Pages (TMA) + Cloudflare Workers (API/Bot webhook).
    Be strict, produce evidence, and recommend rollback or configuration changes when needed.

  scope:
    environment: "PRODUCTION"
    focus:
      - "DNS correctness (NS, A/AAAA/CNAME, flattening behavior)"
      - "Proxy status (orange cloud vs DNS-only)"
      - "TLS/SSL mode correctness"
      - "Edge certificates validity"
      - "Redirect chain correctness (apex↔www, http→https, path rewrites)"
      - "API subdomain routing"
      - "Bot webhook reachability from Telegram"
    constraints:
      - "Do not require paid services."
      - "Do not change any configuration automatically."
      - "Do not leak secrets in logs."

  inputs_required_from_operator:
    - name: ZONE_DOMAIN
      example: "example.com"
    - name: TMA_FQDN
      example: "app.example.com"
    - name: API_FQDN
      example: "api.example.com"
    - name: EXPECTED_TMA_ORIGIN
      example: "Cloudflare Pages project (pages.dev) or custom domain mapping"
    - name: EXPECTED_API_ORIGIN
      example: "Cloudflare Worker route bound to api.example.com"
    - name: TELEGRAM_WEBHOOK_URL
      example: "https://api.example.com/telegram/webhook"
    - name: OPTIONAL_CLOUDFLARE_API_TOKEN
      example: "token with Zone:Read, DNS:Read, SSL:Read (optional)"
    - name: OPTIONAL_CLOUDFLARE_ZONE_ID
      example: "zone id (optional if token allows lookup)"

  artifacts:
    output_folder: "reports/post_deploy_dns_smoke/"
    required_files:
      - "reports/post_deploy_dns_smoke/DNS_SMOKE_SUMMARY.md"
      - "reports/post_deploy_dns_smoke/DNS_SMOKE_EVIDENCE.log"
      - "reports/post_deploy_dns_smoke/DNS_SMOKE_RESULTS.json"

  global_pass_fail:
    critical_failures:
      - "Domain not delegated to Cloudflare (NS mismatch)"
      - "TMA_FQDN or API_FQDN not resolving correctly"
      - "HTTPS fails (525/526/SSL handshake issues)"
      - "Redirect loop (too many redirects) on TMA or API"
      - "API returns 520/522/523/524 consistently"
      - "Webhook URL not reachable over HTTPS (Telegram cannot deliver updates)"
    on_critical_fail:
      - "State: DO NOT SHIP"
      - "Recommend rollback if caused by a deploy; otherwise recommend DNS/SSL fixes"
      - "Provide exact remediation steps + config diffs to apply in Cloudflare/Vercel/Registrar"
    pass_condition:
      - "All critical checks pass; important checks have no unresolved blockers."

  commands_tooling:
    required:
      - "dig (or nslookup)"
      - "curl"
      - "openssl (for cert inspection)"
    optional:
      - "Cloudflare API via curl if API token is supplied"

  steps:
    - step: 0
      name: "Initialize + capture expectations"
      actions:
        - "Create artifacts folder/files and start timestamped logging."
        - "Record inputs in DNS_SMOKE_RESULTS.json (redact token)."
        - "Record current date/time and operator machine region (for latency context)."
      outputs:
        - "DNS_SMOKE_EVIDENCE.log begins with config snapshot."

    - step: 1
      name: "Nameserver delegation (NS) — critical"
      actions:
        - "dig NS ${ZONE_DOMAIN} +short"
        - "Compare output to expected Cloudflare nameservers shown in Cloudflare dashboard."
        - "If mismatch: flag as registrar delegation issue."
      pass_criteria:
        - "NS records match Cloudflare-assigned nameservers."
      fail_fast: true
      remediation_hints:
        - "Update nameservers in registrar to Cloudflare-provided pair; wait for propagation."

    - step: 2
      name: "Authoritative DNS resolution for TMA and API — critical"
      actions:
        - "dig A ${TMA_FQDN} +short"
        - "dig AAAA ${TMA_FQDN} +short"
        - "dig CNAME ${TMA_FQDN} +short"
        - "dig A ${API_FQDN} +short"
        - "dig AAAA ${API_FQDN} +short"
        - "dig CNAME ${API_FQDN} +short"
        - "Record whether apex uses CNAME flattening (if applicable)."
      pass_criteria:
        - "TMA_FQDN resolves (A/AAAA or via CNAME) and is not NXDOMAIN."
        - "API_FQDN resolves (A/AAAA or via CNAME) and is not NXDOMAIN."
      fail_fast: true
      remediation_hints:
        - "For Pages: ensure custom domain is added to Pages project."
        - "For Workers: ensure route is bound to API_FQDN and DNS record exists."

    - step: 3
      name: "Cloudflare proxy status sanity — critical"
      actions:
        - "curl -sI https://${TMA_FQDN} | grep -iE 'server:|cf-ray:|cf-cache-status:' || true"
        - "curl -sI https://${API_FQDN}/health | grep -iE 'server:|cf-ray:' || true"
        - "If cf-ray header absent consistently, domain might be DNS-only or bypassing Cloudflare."
      pass_criteria:
        - "Requests show Cloudflare edge headers (cf-ray) for TMA and API (expected for Cloudflare-hosted)."
      fail_fast: false
      remediation_hints:
        - "Ensure DNS record is Proxied (orange cloud) when appropriate."
        - "For Workers routes, Cloudflare will serve at edge; missing headers can indicate wrong hostname/route."

    - step: 4
      name: "TLS certificate validity — critical"
      actions:
        - "openssl s_client -servername ${TMA_FQDN} -connect ${TMA_FQDN}:443 </dev/null 2>/dev/null | openssl x509 -noout -subject -issuer -dates"
        - "openssl s_client -servername ${API_FQDN} -connect ${API_FQDN}:443 </dev/null 2>/dev/null | openssl x509 -noout -subject -issuer -dates"
        - "Confirm SAN includes hostnames and cert not expired."
      pass_criteria:
        - "Certificates valid, not expired, correct hostnames."
      fail_fast: true
      remediation_hints:
        - "In Cloudflare: SSL/TLS → Edge Certificates; ensure cert issued for hostnames."
        - "Avoid ‘Full (strict)’ unless origin cert chain is valid when using non-Cloudflare origin."

    - step: 5
      name: "SSL mode + common 525/526 diagnostics — critical"
      actions:
        - "curl -vI https://${TMA_FQDN} 2>&1 | tail -n +1 | head -n 80"
        - "curl -vI https://${API_FQDN}/health 2>&1 | tail -n +1 | head -n 80"
        - "If 525/526: document exact error and likely cause."
      pass_criteria:
        - "No 525/526/530 class errors."
      fail_fast: true
      remediation_hints:
        - "If using Cloudflare as proxy to a non-Cloudflare origin: set SSL mode appropriately and install valid origin cert if strict."
        - "For Pages/Workers: SSL issues usually point to wrong DNS target / wrong domain mapping."

    - step: 6
      name: "Redirect chain + loop detection (apex/www/http/https) — critical"
      actions:
        - "curl -sIL http://${TMA_FQDN} | sed -n '1,20p'"
        - "curl -sIL https://${TMA_FQDN} | sed -n '1,20p'"
        - "curl -sIL http://${API_FQDN}/health | sed -n '1,20p'"
        - "curl -sIL https://${API_FQDN}/health | sed -n '1,20p'"
        - "If using apex and www: run same for ${ZONE_DOMAIN} and www.${ZONE_DOMAIN} (if applicable)."
        - "Detect 'too many redirects' and inconsistent Location headers."
      pass_criteria:
        - "At most 1–3 redirects; terminates at https canonical URL."
        - "No redirect loops."
      fail_fast: true
      remediation_hints:
        - "Check Cloudflare Redirect Rules / Page Rules."
        - "Avoid double redirects (Cloudflare + app) fighting each other."
        - "Ensure Always Use HTTPS does not conflict with app redirects."

    - step: 7
      name: "Content sanity for TMA (important)"
      actions:
        - "curl -s https://${TMA_FQDN} | head -n 30"
        - "Confirm HTML served, not an error page."
        - "Check cache headers do not wrongly cache HTML forever (prefer short/no-cache for HTML shell)."
      pass_criteria:
        - "TMA serves expected HTML app shell."
      fail_fast: false

    - step: 8
      name: "API routing sanity (critical)"
      actions:
        - "curl -sS -D- https://${API_FQDN}/health -o /dev/null | sed -n '1,30p'"
        - "curl -sS https://${API_FQDN}/version || true"
        - "If 404: ensure Worker route matches hostname and path."
      pass_criteria:
        - "Health returns 200 OK (or defined ok response)."
      fail_fast: true
      remediation_hints:
        - "Verify wrangler.toml routes for production env include ${API_FQDN}/*."
        - "Confirm zone route binding in Cloudflare dashboard."

    - step: 9
      name: "CORS + security headers (important)"
      actions:
        - "curl -sI https://${API_FQDN}/health | grep -iE 'access-control-allow|content-security-policy|x-frame-options|referrer-policy|permissions-policy' || true"
        - "Confirm API CORS allows only TMA origin(s) (app domain) for credentialed endpoints."
      pass_criteria:
        - "No wildcard CORS on authenticated endpoints."
      fail_fast: false
      remediation_hints:
        - "Restrict CORS to TMA origin(s) and required methods/headers."

    - step: 10
      name: "Webhook reachability (Telegram delivery precondition) — critical"
      actions:
        - "curl -sS -D- ${TELEGRAM_WEBHOOK_URL} -o /dev/null | sed -n '1,30p'"
        - "Confirm returns 200/405 as expected (depending on method)."
        - "Confirm HTTPS only; no redirects from webhook URL."
      pass_criteria:
        - "Webhook URL is reachable over HTTPS and does not redirect."
      fail_fast: true
      remediation_hints:
        - "Telegram webhooks dislike redirects; use final canonical https URL."
        - "If protected by auth, ensure Telegram secret header validation is implemented server-side without blocking delivery."

    - step: 11
      name: "Cloudflare API readback (optional but powerful)"
      conditional_on: "OPTIONAL_CLOUDFLARE_API_TOKEN is provided"
      actions:
        - "Use Cloudflare API to fetch zone id (if not provided)."
        - "List DNS records for TMA_FQDN and API_FQDN; capture proxied status."
        - "Fetch SSL/TLS settings (mode) and Edge certificate status."
      pass_criteria:
        - "DNS records exist and are proxied as expected."
        - "SSL mode is consistent with your hosting (Pages/Workers generally safe)."
      fail_fast: false

    - step: 12
      name: "Summarize + remediation plan"
      actions:
        - "Write DNS_SMOKE_SUMMARY.md with pass/fail per step."
        - "Include the exact curl/dig outputs (redacting any sensitive material)."
        - "If failures: provide a minimal set of changes to fix them, in order."
        - "If passed: document the canonical URLs and recommended Cloudflare settings snapshot."
      outputs:
        - "DNS_SMOKE_SUMMARY.md"
        - "DNS_SMOKE_EVIDENCE.log"
        - "DNS_SMOKE_RESULTS.json"

  known_failure_patterns_and_fast_diagnosis:
    - pattern: "ERR_TOO_MANY_REDIRECTS"
      likely_causes:
        - "Conflicting redirect rules (Cloudflare + app)"
        - "Always Use HTTPS + app http->https mismatch"
      fix:
        - "Remove one side; keep Cloudflare redirect rules simple and canonicalize once."
    - pattern: "525 SSL handshake failed"
      likely_causes:
        - "Wrong DNS target/origin mismatch"
        - "Origin TLS misconfigured (when not Pages/Workers)"
      fix:
        - "Verify DNS points to correct Cloudflare service; re-issue edge certs; verify SSL mode."
    - pattern: "526 Invalid SSL certificate"
      likely_causes:
        - "Using Full (strict) to a non-valid origin cert"
      fix:
        - "Install valid origin cert or adjust SSL mode appropriately."
    - pattern: "520/522/523/524"
      likely_causes:
        - "Route mismatch to Worker"
        - "Origin unreachable (if not Workers)"
      fix:
        - "Verify Worker route bindings and DNS records."

  final_output_contract:
    must_state:
      - "READY TO SHIP (DNS/TLS) or DO NOT SHIP"
      - "Canonical TMA URL + canonical API URL"
      - "Redirect map (from→to) for http/https and apex/www"
      - "If not ready: exact remediation steps in priority order"
