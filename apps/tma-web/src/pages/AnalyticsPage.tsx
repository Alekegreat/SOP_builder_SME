import { useQuery } from '@tanstack/react-query';
import { getAnalytics } from '../lib/api.js';
import { useAuthStore } from '../stores/authStore.js';

export function AnalyticsPage() {
  const workspaceId = useAuthStore((s) => s.workspaceId);
  const { data, isLoading } = useQuery({
    queryKey: ['analytics', workspaceId],
    queryFn: () => getAnalytics(workspaceId!),
    enabled: !!workspaceId,
  });

  const totalSops = data?.totalSops ?? 0;
  const published = data?.statusBreakdown?.PUBLISHED ?? 0;
  const staleSops = data?.staleSops ?? 0;
  const pendingApprovals = data?.pendingApprovals ?? 0;
  const coverage = totalSops ? Math.round((published / totalSops) * 100) : 0;

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">Analytics</h1>
      {isLoading ? (
        <p className="text-sm text-tg-hint">Loading analytics...</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Total SOPs" value={String(totalSops)} />
            <StatCard label="Published" value={String(published)} />
            <StatCard label="Stale" value={String(staleSops)} />
            <StatCard label="Coverage" value={`${coverage}%`} />
            <StatCard label="Pending Approvals" value={String(pendingApprovals)} />
            {data?.credits && (
              <StatCard label="Credits Left" value={String(data.credits.remaining)} />
            )}
          </div>
        </>
      )}
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
