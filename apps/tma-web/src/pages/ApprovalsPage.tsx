import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../stores/authStore.js';
import { getApprovalInbox, decideApproval } from '../lib/api.js';
import { LoadingSpinner } from '../components/LoadingSpinner.js';

export function ApprovalsPage() {
  const workspaceId = useAuthStore((s) => s.workspaceId);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['approvals', workspaceId],
    queryFn: () => getApprovalInbox(workspaceId!),
    enabled: !!workspaceId,
  });

  const decideMutation = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'APPROVED' | 'REJECTED' }) =>
      decideApproval(id, { decision }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
    },
  });

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">Approvals</h1>

      {isLoading ? (
        <LoadingSpinner />
      ) : !data?.data?.length ? (
        <div className="text-center py-12">
          <span className="text-4xl block mb-2">✅</span>
          <p className="text-tg-hint">No pending approvals</p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.data.map((approval: Record<string, unknown>) => (
            <div key={approval.id as string} className="bg-tg-secondary rounded-xl p-4">
              <h3 className="font-medium">{approval.sop_title as string}</h3>
              <p className="text-xs text-tg-hint mb-3">
                Version {approval.semver as string}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() =>
                    decideMutation.mutate({
                      id: approval.id as string,
                      decision: 'APPROVED',
                    })
                  }
                  disabled={decideMutation.isPending}
                  className="flex-1 bg-green-500 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50"
                >
                  ✅ Approve
                </button>
                <button
                  onClick={() =>
                    decideMutation.mutate({
                      id: approval.id as string,
                      decision: 'REJECTED',
                    })
                  }
                  disabled={decideMutation.isPending}
                  className="flex-1 bg-red-500 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50"
                >
                  ❌ Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
