import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../stores/authStore.js';
import { getAuditLogs } from '../lib/api.js';
import { LoadingSpinner } from '../components/LoadingSpinner.js';

const PAGE_SIZE = 20;

export function AuditLogsPage() {
  const workspaceId = useAuthStore((s) => s.workspaceId);
  const [offset, setOffset] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', workspaceId, offset],
    queryFn: () => getAuditLogs({ workspaceId: workspaceId!, limit: PAGE_SIZE, offset }),
    enabled: !!workspaceId,
  });

  const logs = data?.data ?? [];
  const total = data?.total ?? 0;
  const hasNext = offset + PAGE_SIZE < total;
  const hasPrev = offset > 0;

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">Audit Logs</h1>

      {isLoading ? (
        <LoadingSpinner />
      ) : logs.length === 0 ? (
        <p className="text-sm text-tg-hint">No audit logs found.</p>
      ) : (
        <>
          <div className="space-y-2">
            {logs.map((log: Record<string, unknown>) => (
              <div key={log.id as string} className="bg-tg-secondary rounded-xl p-3">
                <div className="flex justify-between items-start">
                  <p className="text-sm font-medium">{log.action as string}</p>
                  <span className="text-xs text-tg-hint whitespace-nowrap ml-2">
                    {(log.at as string) ? new Date(log.at as string).toLocaleString() : '-'}
                  </span>
                </div>
                <p className="text-xs text-tg-hint mt-0.5">
                  {log.entity_type as string} • {log.entity_id as string}
                </p>
              </div>
            ))}
          </div>

          {/* Pagination */}
          <div className="flex justify-between items-center mt-4">
            <button
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              disabled={!hasPrev}
              className="bg-tg-secondary px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-30"
            >
              ← Prev
            </button>
            <span className="text-xs text-tg-hint">
              {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
            </span>
            <button
              onClick={() => setOffset(offset + PAGE_SIZE)}
              disabled={!hasNext}
              className="bg-tg-secondary px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-30"
            >
              Next →
            </button>
          </div>
        </>
      )}
    </div>
  );
}
