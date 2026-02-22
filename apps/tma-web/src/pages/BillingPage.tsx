import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../stores/authStore.js';
import { getBillingPlan, purchaseCredits, upgradePlan } from '../lib/api.js';
import { LoadingSpinner } from '../components/LoadingSpinner.js';
import { PLANS, ENTITLEMENTS, CREDIT_PACKS, PLAN_PRICES, PLAN_STARS_PRICES } from '@sop/shared';
import type { Plan } from '@sop/shared';

type TelegramWebApp = {
  openInvoice: (url: string, callback?: (status: string) => void) => void;
};

function getTelegramWebApp(): TelegramWebApp | null {
  return (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp ?? null;
}

export function BillingPage() {
  const workspaceId = useAuthStore((s) => s.workspaceId);
  const queryClient = useQueryClient();
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['billing', workspaceId],
    queryFn: () => getBillingPlan(workspaceId!),
    enabled: !!workspaceId,
  });

  async function handleUpgrade(plan: string) {
    if (!workspaceId || pendingAction) return;
    setPendingAction(`upgrade:${plan}`);
    try {
      const { invoiceUrl } = await upgradePlan(workspaceId, plan);
      const tg = getTelegramWebApp();
      if (tg) {
        tg.openInvoice(invoiceUrl, (status) => {
          if (status === 'paid') {
            queryClient.invalidateQueries({ queryKey: ['billing'] });
            setToast({ type: 'success', msg: `Upgraded to ${plan.replace('_', ' ')}!` });
          } else if (status === 'cancelled') {
            setToast({ type: 'error', msg: 'Payment cancelled.' });
          }
          setPendingAction(null);
          setTimeout(() => setToast(null), 4000);
        });
      } else {
        // Fallback: open in browser (won't happen inside Telegram)
        window.open(invoiceUrl, '_blank');
        setPendingAction(null);
      }
    } catch (err) {
      setToast({ type: 'error', msg: (err as Error).message });
      setPendingAction(null);
      setTimeout(() => setToast(null), 4000);
    }
  }

  async function handleBuyCredits(packId: string) {
    if (!workspaceId || pendingAction) return;
    setPendingAction(`credits:${packId}`);
    try {
      const { invoiceUrl } = await purchaseCredits(workspaceId, packId);
      const tg = getTelegramWebApp();
      if (tg) {
        tg.openInvoice(invoiceUrl, (status) => {
          if (status === 'paid') {
            queryClient.invalidateQueries({ queryKey: ['billing'] });
            setToast({ type: 'success', msg: 'Credits purchased!' });
          } else if (status === 'cancelled') {
            setToast({ type: 'error', msg: 'Payment cancelled.' });
          }
          setPendingAction(null);
          setTimeout(() => setToast(null), 4000);
        });
      } else {
        window.open(invoiceUrl, '_blank');
        setPendingAction(null);
      }
    } catch (err) {
      setToast({ type: 'error', msg: (err as Error).message });
      setPendingAction(null);
      setTimeout(() => setToast(null), 4000);
    }
  }

  if (isLoading) return <LoadingSpinner />;

  const currentPlan = (data?.plan as string) ?? 'FREE';
  const entitlements = ENTITLEMENTS[currentPlan as keyof typeof ENTITLEMENTS];
  const usage = data?.usage as Record<string, number> | undefined;

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">Billing & Plan</h1>

      {/* Toast */}
      {toast && (
        <div
          className={`mb-4 p-3 rounded-lg text-sm font-medium ${
            toast.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
          }`}
        >
          {toast.msg}
        </div>
      )}

      {/* Current plan */}
      <div className="bg-tg-secondary rounded-xl p-4 mb-4">
        <div className="flex justify-between items-center mb-2">
          <h2 className="font-semibold">Current Plan</h2>
          <span className="bg-tg-button text-tg-button-text px-3 py-1 rounded-full text-xs font-bold">
            {currentPlan}
          </span>
        </div>
        <div className="text-sm space-y-1 text-tg-hint">
          <p>Max SOPs: {entitlements.maxSops === -1 ? 'Unlimited' : entitlements.maxSops}</p>
          <p>
            Max Members: {entitlements.maxMembers === -1 ? 'Unlimited' : entitlements.maxMembers}
          </p>
          <p>
            AI Credits/mo:{' '}
            {entitlements.aiCreditsPerMonth === -1 ? 'Unlimited' : entitlements.aiCreditsPerMonth}
          </p>
          <p>BYO Key: {entitlements.requiresByoKey ? 'Required' : 'Optional'}</p>
        </div>
      </div>

      {/* Usage */}
      {usage && (
        <div className="bg-tg-secondary rounded-xl p-4 mb-4">
          <h2 className="font-semibold mb-2">This Month's Usage</h2>
          <div className="text-sm space-y-1 text-tg-hint">
            <p>
              Credits Used: {usage.creditsUsed ?? 0} /{' '}
              {(usage.creditsIncluded ?? 0) + (usage.creditsBought ?? 0)}
            </p>
          </div>
        </div>
      )}

      {/* Upgrade options */}
      <h2 className="font-semibold mb-3">Plans</h2>
      <div className="space-y-3">
        {PLANS.map((plan) => {
          const e = ENTITLEMENTS[plan];
          const price = PLAN_PRICES[plan];
          const starPrice = plan !== 'FREE' ? PLAN_STARS_PRICES[plan as Exclude<Plan, 'FREE'>] : 0;
          const isCurrent = plan === currentPlan;
          return (
            <div
              key={plan}
              className={`border rounded-xl p-4 ${isCurrent ? 'border-tg-button' : 'border-tg-hint/20'}`}
            >
              <div className="flex justify-between items-center mb-2">
                <h3 className="font-medium">{plan}</h3>
                <span className="font-bold">{price === 0 ? 'Free' : `$${price / 100}/mo`}</span>
              </div>
              <div className="text-xs text-tg-hint space-y-0.5">
                <p>
                  {e.maxSops === -1 ? '∞' : e.maxSops} SOPs •{' '}
                  {e.maxMembers === -1 ? '∞' : e.maxMembers} members
                </p>
                <p>{e.aiCreditsPerMonth === -1 ? '∞' : e.aiCreditsPerMonth} AI credits/mo</p>
                {e.diffs && <p>✓ Version diffs</p>}
                {e.reviewCycles && <p>✓ Review cycles</p>}
              </div>
              {!isCurrent && price > 0 && (
                <button
                  onClick={() => handleUpgrade(plan)}
                  disabled={!!pendingAction}
                  className="mt-3 w-full bg-tg-button text-tg-button-text rounded-lg py-2 text-sm font-medium disabled:opacity-50"
                >
                  {pendingAction === `upgrade:${plan}`
                    ? 'Processing...'
                    : `Upgrade — ${starPrice} ⭐`}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Credit packs */}
      <h2 className="font-semibold mt-6 mb-3">Buy AI Credits</h2>
      <div className="grid grid-cols-3 gap-2">
        {CREDIT_PACKS.map((pack) => (
          <button
            key={pack.id}
            onClick={() => handleBuyCredits(pack.id)}
            disabled={!!pendingAction}
            className="bg-tg-secondary rounded-xl p-3 text-center disabled:opacity-50"
          >
            <p className="font-bold text-lg">{pack.credits}</p>
            <p className="text-xs text-tg-hint">credits</p>
            <p className="text-sm font-medium mt-1">{pack.starsPrice} ⭐</p>
          </button>
        ))}
      </div>
    </div>
  );
}
