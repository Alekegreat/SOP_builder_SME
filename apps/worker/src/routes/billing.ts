import { Hono } from 'hono';
import type { AppEnv } from '../app.js';
import { getAuth } from '../middleware/auth.js';
import { authMiddleware } from '../middleware/auth.js';
import { assertPermission } from '../services/rbac.js';
import { getBillingInfo, updatePlan, addCredits } from '../services/billing.js';
import {
  recordPaymentEvent,
  isPaymentProcessed,
  resolveWorkspaceForUser,
  validateWalletPaySignature,
} from '../services/payments.js';
import { writeAuditLog } from '../services/audit.js';
import { isFeatureEnabled } from '../env.js';
import type { WorkspaceRole, Plan } from '@sop/shared';
import { TonConfirmSchema, PLAN_STARS_PRICES, CREDIT_PACKS } from '@sop/shared';

export const billingRoutes = new Hono<AppEnv>();

billingRoutes.use('/plan', authMiddleware);
billingRoutes.use('/upgrade', authMiddleware);
billingRoutes.use('/credits', authMiddleware);
billingRoutes.use('/ton/confirm', authMiddleware);

async function getMembership(db: D1Database, workspaceId: string, userId: string) {
  const m = await db
    .prepare('SELECT role FROM memberships WHERE workspace_id = ? AND user_id = ?')
    .bind(workspaceId, userId)
    .first<{ role: string }>();
  if (!m) throw new Error('FORBIDDEN: Not a member of this workspace');
  return m.role as WorkspaceRole;
}

/**
 * GET /billing/plan — Get billing info for workspace
 */
billingRoutes.get('/plan', async (c) => {
  const auth = getAuth(c);
  const workspaceId = c.req.query('workspaceId');
  if (!workspaceId) {
    return c.json({ error: { code: 'BAD_REQUEST', message: 'workspaceId required' } }, 400);
  }

  await getMembership(c.env.DB, workspaceId, auth.userId);
  const info = await getBillingInfo(c.env.DB, workspaceId);
  return c.json(info);
});

/**
 * POST /billing/upgrade — Create Telegram Stars invoice link for plan upgrade
 */
billingRoutes.post('/upgrade', async (c) => {
  const auth = getAuth(c);
  const { workspaceId, plan } = await c.req.json<{ workspaceId: string; plan: string }>();
  if (!workspaceId || !plan) {
    return c.json(
      { error: { code: 'BAD_REQUEST', message: 'workspaceId and plan required' } },
      400,
    );
  }

  const role = await getMembership(c.env.DB, workspaceId, auth.userId);
  assertPermission(role, 'workspace:billing');

  const starPrice = PLAN_STARS_PRICES[plan as Exclude<Plan, 'FREE'>];
  if (!starPrice) {
    return c.json({ error: { code: 'BAD_REQUEST', message: 'Invalid plan' } }, 400);
  }

  const payload = JSON.stringify({ workspaceId, planId: plan });
  const resp = await fetch(`https://api.telegram.org/bot${c.env.BOT_TOKEN}/createInvoiceLink`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: `SOP Builder — ${plan.replace('_', ' ')} Plan`,
      description: `Monthly subscription to the ${plan.replace('_', ' ')} plan.`,
      payload,
      currency: 'XTR',
      prices: [{ label: `${plan.replace('_', ' ')} (monthly)`, amount: starPrice }],
    }),
  });

  const data = (await resp.json()) as { ok: boolean; result?: string; description?: string };
  if (!data.ok) {
    console.error('createInvoiceLink error:', data);
    return c.json(
      { error: { code: 'PAYMENT_ERROR', message: data.description ?? 'Failed to create invoice' } },
      502,
    );
  }

  return c.json({ invoiceUrl: data.result });
});

/**
 * POST /billing/credits — Create Telegram Stars invoice link for credit pack
 */
billingRoutes.post('/credits', async (c) => {
  const auth = getAuth(c);
  const { workspaceId, packId } = await c.req.json<{ workspaceId: string; packId: string }>();
  if (!workspaceId || !packId) {
    return c.json(
      { error: { code: 'BAD_REQUEST', message: 'workspaceId and packId required' } },
      400,
    );
  }

  const role = await getMembership(c.env.DB, workspaceId, auth.userId);
  assertPermission(role, 'workspace:billing');

  const pack = CREDIT_PACKS.find((p) => p.id === packId);
  if (!pack) {
    return c.json({ error: { code: 'BAD_REQUEST', message: 'Invalid pack' } }, 400);
  }

  const payload = JSON.stringify({ workspaceId, credits: pack.credits });
  const resp = await fetch(`https://api.telegram.org/bot${c.env.BOT_TOKEN}/createInvoiceLink`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: `SOP Builder — ${pack.credits} AI Credits`,
      description: `${pack.credits} AI generation credits for your workspace.`,
      payload,
      currency: 'XTR',
      prices: [{ label: `${pack.credits} AI Credits`, amount: pack.starsPrice }],
    }),
  });

  const data = (await resp.json()) as { ok: boolean; result?: string; description?: string };
  if (!data.ok) {
    console.error('createInvoiceLink error:', data);
    return c.json(
      { error: { code: 'PAYMENT_ERROR', message: data.description ?? 'Failed to create invoice' } },
      502,
    );
  }

  return c.json({ invoiceUrl: data.result });
});

/**
 * POST /billing/stars/webhook — Telegram Stars payment webhook
 * No auth middleware — validated by checking Telegram webhook source
 */
billingRoutes.post('/stars/webhook', async (c) => {
  // R1 FIX: Validate Telegram webhook source via secret token header
  const secretToken = c.req.header('X-Telegram-Bot-Api-Secret-Token');
  const expectedSecret = c.env.BOT_WEBHOOK_SECRET;
  if (expectedSecret) {
    if (!secretToken || secretToken !== expectedSecret) {
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'Invalid webhook secret' } }, 401);
    }
  } else {
    // Reject when secret is not configured — prevents webhook spoofing in misconfigured deployments
    return c.json(
      { error: { code: 'SERVER_ERROR', message: 'Webhook secret not configured' } },
      500,
    );
  }

  const body = await c.req.json();

  // Handle successful payment
  const payment = body?.message?.successful_payment;
  if (!payment) {
    // It might be a pre_checkout_query — answer OK
    if (body?.pre_checkout_query) {
      // In production, call Telegram answerPreCheckoutQuery
      return c.json({ ok: true });
    }
    return c.json({ ok: true });
  }

  const externalId = payment.telegram_payment_charge_id;

  // Idempotency check
  if (await isPaymentProcessed(c.env.DB, 'stars', externalId)) {
    return c.json({ ok: true, deduplicated: true });
  }

  // Parse payload to determine workspace and plan
  let payloadData: { workspaceId?: string; planId?: string; credits?: number };
  try {
    payloadData = JSON.parse(payment.invoice_payload);
  } catch {
    payloadData = {};
  }

  const workspaceId =
    payloadData.workspaceId ?? (await resolveWorkspaceForUser(c.env.DB, body.message?.from?.id));

  if (!workspaceId) {
    console.error('Stars webhook: could not resolve workspace');
    return c.json({ error: { code: 'BAD_REQUEST', message: 'Cannot resolve workspace' } }, 400);
  }

  await recordPaymentEvent(c.env.DB, {
    workspaceId,
    provider: 'stars',
    status: 'completed',
    externalId,
    amount: payment.total_amount,
    currency: payment.currency,
    rawJson: body,
  });

  // Apply plan change or credits
  if (payloadData.planId) {
    await updatePlan(c.env.DB, workspaceId, payloadData.planId as Plan);
  }
  if (payloadData.credits) {
    await addCredits(c.env.DB, workspaceId, payloadData.credits);
  }

  await writeAuditLog(c.env.DB, {
    workspaceId,
    actorUserId: 'system',
    action: 'billing.payment_received',
    entityType: 'payment_event',
    entityId: externalId,
    meta: { provider: 'stars', amount: payment.total_amount },
  });

  return c.json({ ok: true });
});

/**
 * POST /billing/walletpay/webhook — Wallet Pay webhook
 */
billingRoutes.post('/walletpay/webhook', async (c) => {
  if (!isFeatureEnabled(c.env, 'WALLETPAY')) {
    return c.json(
      { error: { code: 'FEATURE_DISABLED', message: 'Wallet Pay is not enabled' } },
      501,
    );
  }

  const rawBody = await c.req.text();
  const signature = c.req.header('WalletPay-Signature') ?? '';

  if (c.env.WALLETPAY_WEBHOOK_SECRET) {
    const valid = await validateWalletPaySignature(
      rawBody,
      signature,
      c.env.WALLETPAY_WEBHOOK_SECRET,
    );
    if (!valid) {
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'Invalid webhook signature' } }, 401);
    }
  }

  const body = JSON.parse(rawBody);
  const event = body;

  const externalId = event.payload?.externalId ?? event.eventId;

  if (await isPaymentProcessed(c.env.DB, 'walletpay', externalId)) {
    return c.json({ ok: true, deduplicated: true });
  }

  let payloadMeta: { workspaceId?: string; planId?: string; credits?: number };
  try {
    payloadMeta = JSON.parse(event.payload?.customData ?? '{}');
  } catch {
    payloadMeta = {};
  }

  const workspaceId = payloadMeta.workspaceId;
  if (!workspaceId) {
    return c.json(
      { error: { code: 'BAD_REQUEST', message: 'Missing workspaceId in customData' } },
      400,
    );
  }

  await recordPaymentEvent(c.env.DB, {
    workspaceId,
    provider: 'walletpay',
    status: event.payload?.status === 'PAID' ? 'completed' : 'pending',
    externalId,
    amount: parseInt(event.payload?.amount?.amount ?? '0'),
    currency: event.payload?.amount?.currencyCode ?? 'USDT',
    rawJson: body,
  });

  if (event.payload?.status === 'PAID') {
    if (payloadMeta.planId) {
      await updatePlan(c.env.DB, workspaceId, payloadMeta.planId as Plan);
    }
    if (payloadMeta.credits) {
      await addCredits(c.env.DB, workspaceId, payloadMeta.credits);
    }
  }

  return c.json({ ok: true });
});

/**
 * POST /billing/ton/confirm — Confirm TON transaction
 */
billingRoutes.post('/ton/confirm', async (c) => {
  const auth = getAuth(c);
  const body = await c.req.json();
  const parsed = TonConfirmSchema.parse(body);

  const role = await getMembership(c.env.DB, parsed.workspaceId, auth.userId);
  assertPermission(role, 'workspace:billing');

  // Idempotency
  if (await isPaymentProcessed(c.env.DB, 'ton', parsed.transactionHash)) {
    return c.json({ ok: true, deduplicated: true });
  }

  // TON verification strategy
  if (isFeatureEnabled(c.env, 'TON_VERIFICATION') && c.env.TON_API_ENDPOINT) {
    // Call TON center API to verify transaction
    try {
      const resp = await fetch(
        `${c.env.TON_API_ENDPOINT}/getTransactions?hash=${parsed.transactionHash}`,
        {
          headers: c.env.TON_API_KEY ? { 'X-API-Key': c.env.TON_API_KEY } : {},
        },
      );
      if (!resp.ok) {
        return c.json(
          { error: { code: 'VERIFICATION_FAILED', message: 'Could not verify TON transaction' } },
          400,
        );
      }
      // In production, validate amount, destination address, etc.
    } catch {
      return c.json({ error: { code: 'VERIFICATION_FAILED', message: 'TON API error' } }, 502);
    }
  } else {
    // Manual fallback mode — admin must confirm later
    await recordPaymentEvent(c.env.DB, {
      workspaceId: parsed.workspaceId,
      provider: 'ton',
      status: 'pending', // pending manual verification
      externalId: parsed.transactionHash,
      amount: parseInt(parsed.amount),
      currency: 'TON',
      rawJson: { ...parsed, userId: auth.userId },
    });

    return c.json({
      ok: true,
      status: 'pending_verification',
      message: 'Transaction recorded. Admin will verify manually.',
    });
  }

  // Verified — record and apply
  await recordPaymentEvent(c.env.DB, {
    workspaceId: parsed.workspaceId,
    provider: 'ton',
    status: 'completed',
    externalId: parsed.transactionHash,
    amount: parseInt(parsed.amount),
    currency: 'TON',
    rawJson: { ...parsed, userId: auth.userId },
  });

  await updatePlan(c.env.DB, parsed.workspaceId, parsed.planId);

  await writeAuditLog(c.env.DB, {
    workspaceId: parsed.workspaceId,
    actorUserId: auth.userId,
    action: 'billing.payment_received',
    entityType: 'payment_event',
    entityId: parsed.transactionHash,
    meta: { provider: 'ton', amount: parsed.amount },
  });

  return c.json({ ok: true, status: 'completed' });
});
