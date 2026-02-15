/**
 * Worker environment bindings type definition
 */
export interface Env {
  // Cloudflare bindings
  DB: D1Database;
  R2: R2Bucket;
  QUEUE: Queue;

  // Secrets
  BOT_TOKEN: string;
  BOT_WEBHOOK_SECRET: string;
  JWT_SECRET: string;
  ENCRYPTION_KEY: string;

  // Optional AI config
  DEFAULT_AI_API_BASE?: string;
  DEFAULT_AI_API_KEY?: string;
  DEFAULT_AI_MODEL?: string;

  // Feature flags
  FEATURE_TON_VERIFICATION?: string;
  FEATURE_WALLETPAY?: string;
  FEATURE_PDF_EXPORT?: string;

  // TON
  TON_API_ENDPOINT?: string;
  TON_API_KEY?: string;

  // Wallet Pay
  WALLETPAY_API_KEY?: string;
  WALLETPAY_WEBHOOK_SECRET?: string;

  // Environment
  ENVIRONMENT?: string;
}

export function isFeatureEnabled(env: Env, feature: string): boolean {
  const key = `FEATURE_${feature.toUpperCase()}` as keyof Env;
  return env[key] === 'true';
}
