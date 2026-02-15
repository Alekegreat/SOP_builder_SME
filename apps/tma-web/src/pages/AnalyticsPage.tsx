import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { listSops } from '../lib/api.js';
import { useAuthStore } from '../stores/authStore.js';

export function AnalyticsPage() {
  const workspaceId = useAuthStore((s) => s.workspaceId);
  const { data } = useQuery({
    queryKey: ['analytics-sops', workspaceId],
    queryFn: () => listSops({ workspaceId: workspaceId!, limit: 100 }),
    enabled: !!workspaceId,
  });

  const sops = (data?.data ?? []) as Array<Record<string, unknown>>;
  const published = sops.filter((s) => s.status === 'PUBLISHED').length;
  const stale = sops.filter((s) => {
    const nextReviewAt = s.next_review_at as string | null;
    return !!nextReviewAt && new Date(nextReviewAt).getTime() < Date.now();
  }).length;

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">Analytics</h1>
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Total SOPs" value={String(sops.length)} />
        <StatCard label="Published" value={String(published)} />
        <StatCard label="Stale" value={String(stale)} />
        <StatCard label="Coverage" value={sops.length ? `${Math.round((published / sops.length) * 100)}%` : '0%'} />
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-tg-secondary rounded-xl p-4">
      <p className="text-sm text-tg-hint">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}
