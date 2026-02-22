import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../stores/authStore.js';
import { getWorkspaceMembers, inviteMember, changeMemberRole } from '../lib/api.js';
import { LoadingSpinner } from '../components/LoadingSpinner.js';
import { WORKSPACE_ROLES } from '@sop/shared';

export function RolesPage() {
  const workspaceId = useAuthStore((s) => s.workspaceId);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['members', workspaceId],
    queryFn: () => getWorkspaceMembers(workspaceId!),
    enabled: !!workspaceId,
  });

  const [showInvite, setShowInvite] = useState(false);
  const [inviteTgId, setInviteTgId] = useState('');
  const [inviteRole, setInviteRole] = useState('viewer');

  const inviteMutation = useMutation({
    mutationFn: () =>
      inviteMember(workspaceId!, {
        telegramUserId: Number(inviteTgId),
        role: inviteRole,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members'] });
      setShowInvite(false);
      setInviteTgId('');
    },
  });

  const roleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      changeMemberRole(workspaceId!, userId, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members'] });
    },
  });

  const members = data?.data ?? [];

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">Roles & Members</h1>
        <button
          onClick={() => setShowInvite(!showInvite)}
          className="bg-tg-button text-tg-button-text px-4 py-2 rounded-lg text-sm font-medium"
        >
          + Invite
        </button>
      </div>

      {/* Invite form */}
      {showInvite && (
        <div className="bg-tg-secondary rounded-xl p-4 mb-4">
          <h3 className="font-medium mb-2">Invite Member</h3>
          <input
            type="number"
            value={inviteTgId}
            onChange={(e) => setInviteTgId(e.target.value)}
            placeholder="Telegram User ID"
            className="w-full bg-tg-bg rounded-lg px-3 py-2 text-sm outline-none mb-2"
          />
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value)}
            title="Role for invited member"
            aria-label="Role for invited member"
            className="w-full bg-tg-bg rounded-lg px-3 py-2 text-sm outline-none mb-3"
          >
            {WORKSPACE_ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <button
              onClick={() => setShowInvite(false)}
              className="flex-1 bg-tg-bg rounded-lg py-2 text-sm font-medium"
            >
              Cancel
            </button>
            <button
              onClick={() => inviteMutation.mutate()}
              disabled={!inviteTgId.trim() || inviteMutation.isPending}
              className="flex-1 bg-tg-button text-tg-button-text rounded-lg py-2 text-sm font-medium disabled:opacity-50"
            >
              {inviteMutation.isPending ? 'Inviting...' : 'Invite'}
            </button>
          </div>
          {inviteMutation.isError && (
            <p className="text-red-500 text-xs mt-2">{(inviteMutation.error as Error).message}</p>
          )}
        </div>
      )}

      {/* Members list */}
      {isLoading ? (
        <LoadingSpinner />
      ) : members.length === 0 ? (
        <p className="text-tg-hint text-center py-8">No members found.</p>
      ) : (
        <div className="space-y-2">
          {members.map((m) => (
            <div
              key={m.user_id}
              className="bg-tg-secondary rounded-xl p-3 flex items-center justify-between"
            >
              <div>
                <p className="font-medium">{m.name}</p>
                <p className="text-xs text-tg-hint">TG: {m.telegram_user_id}</p>
              </div>
              <select
                value={m.role}
                onChange={(e) => roleMutation.mutate({ userId: m.user_id, role: e.target.value })}
                title={`Role for ${m.name}`}
                aria-label={`Role for ${m.name}`}
                disabled={roleMutation.isPending}
                className="bg-tg-bg rounded-lg px-2 py-1 text-sm outline-none"
              >
                {WORKSPACE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
