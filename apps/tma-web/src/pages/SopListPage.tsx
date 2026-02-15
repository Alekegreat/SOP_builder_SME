import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore.js';
import { listSops, createSop } from '../lib/api.js';
import { LoadingSpinner } from '../components/LoadingSpinner.js';
import { SOP_STATUSES } from '@sop/shared';

export function SopListPage() {
  const workspaceId = useAuthStore((s) => s.workspaceId);
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [showCreateModal, setShowCreateModal] = useState(searchParams.get('action') === 'new');
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['sops', workspaceId, statusFilter, search],
    queryFn: () =>
      listSops({
        workspaceId: workspaceId!,
        status: statusFilter || undefined,
        search: search || undefined,
      }),
    enabled: !!workspaceId,
  });

  if (!workspaceId) {
    return <div className="p-4 text-tg-hint">No workspace selected.</div>;
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">SOPs</h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-tg-button text-tg-button-text px-4 py-2 rounded-lg text-sm font-medium"
        >
          + New SOP
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          placeholder="Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 bg-tg-secondary rounded-lg px-3 py-2 text-sm outline-none"
        />
        <select
          aria-label="Filter SOPs by status"
          title="Filter SOPs by status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-tg-secondary rounded-lg px-3 py-2 text-sm outline-none"
        >
          <option value="">All</option>
          {Object.values(SOP_STATUSES).map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {/* List */}
      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <div className="space-y-2">
          {data?.data?.length === 0 && (
            <p className="text-tg-hint text-center py-8">No SOPs found. Create your first one!</p>
          )}
          {data?.data?.map((sop: Record<string, unknown>) => (
            <Link
              key={sop.id as string}
              to={`/sops/${sop.id}`}
              className="block bg-tg-secondary rounded-xl p-3"
            >
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-medium">{sop.title as string}</h3>
                  <p className="text-xs text-tg-hint mt-1">
                    {new Date(sop.created_at as string).toLocaleDateString()}
                  </p>
                </div>
                <StatusBadge status={sop.status as string} />
              </div>
            </Link>
          ))}
        </div>
      )}

      {showCreateModal && (
        <CreateSopModal
          workspaceId={workspaceId}
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false);
            queryClient.invalidateQueries({ queryKey: ['sops'] });
          }}
        />
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    DRAFT: 'bg-gray-200 text-gray-700',
    IN_REVIEW: 'bg-yellow-100 text-yellow-800',
    APPROVED: 'bg-green-100 text-green-800',
    PUBLISHED: 'bg-blue-100 text-blue-800',
    SUPERSEDED: 'bg-purple-100 text-purple-800',
    ARCHIVED: 'bg-red-100 text-red-800',
  };

  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[status] ?? 'bg-gray-100'}`}>
      {status}
    </span>
  );
}

function CreateSopModal({
  workspaceId,
  onClose,
  onCreated,
}: {
  workspaceId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState('');
  const [tags, setTags] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      createSop({
        workspaceId,
        title,
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      }),
    onSuccess: onCreated,
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50">
      <div className="bg-tg-bg w-full max-w-md rounded-t-2xl p-6">
        <h2 className="text-lg font-bold mb-4">New SOP</h2>

        <label className="block text-sm font-medium mb-1">Title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g., Employee Onboarding"
          className="w-full bg-tg-secondary rounded-lg px-3 py-2 text-sm outline-none mb-3"
        />

        <label className="block text-sm font-medium mb-1">Tags (comma-separated)</label>
        <input
          type="text"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="e.g., HR, onboarding"
          className="w-full bg-tg-secondary rounded-lg px-3 py-2 text-sm outline-none mb-4"
        />

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 bg-tg-secondary rounded-lg py-2 text-sm font-medium"
          >
            Cancel
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!title.trim() || mutation.isPending}
            className="flex-1 bg-tg-button text-tg-button-text rounded-lg py-2 text-sm font-medium disabled:opacity-50"
          >
            {mutation.isPending ? 'Creating...' : 'Create'}
          </button>
        </div>

        {mutation.isError && (
          <p className="text-red-500 text-xs mt-2">{(mutation.error as Error).message}</p>
        )}
      </div>
    </div>
  );
}
