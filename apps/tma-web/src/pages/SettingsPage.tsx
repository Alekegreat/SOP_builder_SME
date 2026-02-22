import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../stores/authStore.js';
import { getWorkspaceSettings, updateWorkspaceSettings, updateAiConfig } from '../lib/api.js';
import { LoadingSpinner } from '../components/LoadingSpinner.js';

export function SettingsPage() {
  const workspaceId = useAuthStore((s) => s.workspaceId);
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['workspace-settings', workspaceId],
    queryFn: () => getWorkspaceSettings(workspaceId!),
    enabled: !!workspaceId,
  });

  // ── Workspace settings state ──
  const [reviewCycleDays, setReviewCycleDays] = useState(90);
  const [strictApprovals, setStrictApprovals] = useState(false);
  const [requireApproval, setRequireApproval] = useState(false);

  // ── AI config state ──
  const [provider, setProvider] = useState('openai');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');

  // ── Toast state ──
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // Hydrate on data load
  useEffect(() => {
    if (data) {
      setReviewCycleDays(data.reviewCycleDays);
      setStrictApprovals(data.strictApprovals);
      setRequireApproval(data.requireApprovalToPublish);
    }
  }, [data]);

  const settingsMutation = useMutation({
    mutationFn: () =>
      updateWorkspaceSettings(workspaceId!, {
        reviewCycleDays,
        strictApprovals,
        requireApprovalToPublish: requireApproval,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace-settings'] });
      setToast({ type: 'success', msg: 'Settings saved!' });
      setTimeout(() => setToast(null), 3000);
    },
    onError: (err) => {
      setToast({ type: 'error', msg: (err as Error).message });
      setTimeout(() => setToast(null), 4000);
    },
  });

  const aiMutation = useMutation({
    mutationFn: () =>
      updateAiConfig(workspaceId!, {
        provider,
        model,
        apiKey: apiKey || undefined,
      }),
    onSuccess: () => {
      setApiKey('');
      setToast({ type: 'success', msg: 'AI config saved!' });
      setTimeout(() => setToast(null), 3000);
    },
    onError: (err) => {
      setToast({ type: 'error', msg: (err as Error).message });
      setTimeout(() => setToast(null), 4000);
    },
  });

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">Settings</h1>

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

      {/* Profile */}
      <div className="bg-tg-secondary rounded-xl p-4 mb-4">
        <h2 className="font-semibold mb-2">Profile</h2>
        <div className="text-sm space-y-1 text-tg-hint">
          <p>Name: {user?.name}</p>
          <p>Telegram ID: {user?.telegramUserId}</p>
        </div>
      </div>

      {/* Workspace settings */}
      <div className="bg-tg-secondary rounded-xl p-4 mb-4">
        <h2 className="font-semibold mb-2">Workspace</h2>
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium block mb-1">Review Cycle (days)</label>
            <input
              type="number"
              value={reviewCycleDays}
              onChange={(e) => setReviewCycleDays(Number(e.target.value))}
              title="Review cycle in days"
              aria-label="Review cycle in days"
              className="w-full bg-tg-bg rounded-lg px-3 py-2 text-sm outline-none"
            />
          </div>

          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Strict Approvals</label>
            <input
              type="checkbox"
              checked={strictApprovals}
              onChange={(e) => setStrictApprovals(e.target.checked)}
              title="Toggle strict approvals"
              aria-label="Toggle strict approvals"
              className="w-5 h-5 accent-tg-button"
            />
          </div>

          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Require Approval to Publish</label>
            <input
              type="checkbox"
              checked={requireApproval}
              onChange={(e) => setRequireApproval(e.target.checked)}
              title="Require approval to publish"
              aria-label="Require approval to publish"
              className="w-5 h-5 accent-tg-button"
            />
          </div>

          <button
            onClick={() => settingsMutation.mutate()}
            disabled={settingsMutation.isPending}
            className="w-full bg-tg-button text-tg-button-text rounded-lg py-2 text-sm font-medium disabled:opacity-50"
          >
            {settingsMutation.isPending ? 'Saving...' : 'Save Workspace Settings'}
          </button>
        </div>
      </div>

      {/* AI Configuration */}
      <div className="bg-tg-secondary rounded-xl p-4 mb-4">
        <h2 className="font-semibold mb-2">AI Configuration</h2>
        <p className="text-xs text-tg-hint mb-3">
          Bring your own API key for free-plan LLM access.
        </p>

        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium block mb-1">Provider</label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              title="AI provider"
              aria-label="AI provider"
              className="w-full bg-tg-bg rounded-lg px-3 py-2 text-sm outline-none"
            >
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="openrouter">OpenRouter</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Model</label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="gpt-4o-mini"
              className="w-full bg-tg-bg rounded-lg px-3 py-2 text-sm outline-none"
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              className="w-full bg-tg-bg rounded-lg px-3 py-2 text-sm outline-none"
            />
          </div>

          <button
            onClick={() => aiMutation.mutate()}
            disabled={aiMutation.isPending || !model.trim()}
            className="w-full bg-tg-button text-tg-button-text rounded-lg py-2 text-sm font-medium disabled:opacity-50"
          >
            {aiMutation.isPending ? 'Saving...' : 'Save AI Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}
