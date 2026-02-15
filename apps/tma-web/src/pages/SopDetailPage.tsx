import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSop, listVersions, generateSop, publishVersion, deleteSop, exportSop } from '../lib/api.js';
import { LoadingSpinner } from '../components/LoadingSpinner.js';

export function SopDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: sop, isLoading } = useQuery({
    queryKey: ['sop', id],
    queryFn: () => getSop(id!),
    enabled: !!id,
  });

  const { data: versionsData } = useQuery({
    queryKey: ['sop-versions', id],
    queryFn: () => listVersions(id!),
    enabled: !!id,
  });

  const generateMutation = useMutation({
    mutationFn: () => generateSop(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sop', id] });
    },
  });

  const publishMutation = useMutation({
    mutationFn: (versionId: string) => publishVersion(id!, versionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sop', id] });
      queryClient.invalidateQueries({ queryKey: ['sop-versions', id] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteSop(id!),
    onSuccess: () => {
      navigate('/sops', { replace: true });
    },
  });

  const exportMutation = useMutation({
    mutationFn: (format: 'html' | 'pdf') => exportSop(id!, format),
  });

  if (isLoading) return <LoadingSpinner />;
  if (!sop) return <div className="p-4 text-tg-hint">SOP not found.</div>;

  const versions = versionsData?.data ?? [];

  return (
    <div className="p-4">
      {/* Header */}
      <button onClick={() => navigate(-1)} className="text-tg-link text-sm mb-3">
        ← Back
      </button>

      <div className="flex justify-between items-start mb-4">
        <div>
          <h1 className="text-xl font-bold">{sop.title as string}</h1>
          <p className="text-xs text-tg-hint">
            Status: {sop.status as string} | Created: {new Date(sop.created_at as string).toLocaleDateString()}
          </p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 mb-2 flex-wrap">
        <Link
          to={`/sops/${id}/interview`}
          className="bg-tg-button text-tg-button-text px-4 py-2 rounded-lg text-sm font-medium"
        >
          📝 Interview
        </Link>
        <Link
          to={`/sops/${id}/versions`}
          className="bg-tg-secondary px-4 py-2 rounded-lg text-sm font-medium"
        >
          🔍 Version Diff
        </Link>
        <button
          onClick={() => generateMutation.mutate()}
          disabled={generateMutation.isPending}
          className="bg-tg-secondary px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
        >
          {generateMutation.isPending ? '⏳ Generating...' : '🤖 Generate'}
        </button>
      </div>

      {/* Secondary actions */}
      <div className="flex gap-2 mb-6 flex-wrap">
        <button
          onClick={() => exportMutation.mutate('html')}
          disabled={exportMutation.isPending}
          className="bg-tg-secondary px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50"
        >
          {exportMutation.isPending ? '⏳...' : '📤 Export HTML'}
        </button>
        <button
          onClick={() => exportMutation.mutate('pdf')}
          disabled={exportMutation.isPending}
          className="bg-tg-secondary px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50"
        >
          📄 Export PDF
        </button>
        <button
          onClick={() => {
            if (window.confirm('Archive this SOP? This can be undone by an admin.')) {
              deleteMutation.mutate();
            }
          }}
          disabled={deleteMutation.isPending}
          className="bg-red-50 text-red-600 px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50"
        >
          {deleteMutation.isPending ? '⏳...' : '🗑 Archive'}
        </button>
      </div>

      {generateMutation.isSuccess && (
        <div className="bg-green-50 text-green-800 p-3 rounded-lg text-sm mb-4">
          ✅ Generation queued! You'll receive a notification when ready.
        </div>
      )}

      {/* Versions */}
      <h2 className="font-semibold mb-3">Versions</h2>
      {versions.length === 0 ? (
        <p className="text-tg-hint text-sm">No versions yet. Complete an interview and generate.</p>
      ) : (
        <div className="space-y-2">
          {versions.map((v: Record<string, unknown>) => (
            <div key={v.id as string} className="bg-tg-secondary rounded-xl p-3">
              <div className="flex justify-between items-center">
                <div>
                  <span className="font-mono text-sm font-medium">{v.semver as string}</span>
                  <span className="text-xs text-tg-hint ml-2">
                    {new Date(v.created_at as string).toLocaleDateString()}
                  </span>
                </div>
                {sop.status !== 'PUBLISHED' && (
                  <button
                    onClick={() => publishMutation.mutate(v.id as string)}
                    disabled={publishMutation.isPending}
                    className="bg-tg-button text-tg-button-text px-3 py-1 rounded text-xs font-medium disabled:opacity-50"
                  >
                    Publish
                  </button>
                )}
              </div>
              {typeof v.diff_summary === 'string' && v.diff_summary.length > 0 && (
                <p className="text-xs text-tg-hint mt-1">{v.diff_summary}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
