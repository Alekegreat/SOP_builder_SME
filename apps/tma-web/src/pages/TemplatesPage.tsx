import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../stores/authStore.js';
import { createSop, listTemplates } from '../lib/api.js';

export function TemplatesPage() {
  const workspaceId = useAuthStore((s) => s.workspaceId);
  const navigate = useNavigate();
  const [loadingIdx, setLoadingIdx] = useState<number | null>(null);

  const { data: templatesData, isLoading } = useQuery({
    queryKey: ['templates'],
    queryFn: () => listTemplates(),
  });

  const templates = templatesData?.data ?? [];

  const mutation = useMutation({
    mutationFn: (template: { title: string; tags: string[] }) =>
      createSop({
        workspaceId: workspaceId!,
        title: template.title,
        tags: template.tags,
      }),
    onSuccess: (data) => {
      const sopId = (data as Record<string, unknown>).id as string;
      navigate(`/sops/${sopId}`);
    },
  });

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">Templates</h1>
      <p className="text-sm text-tg-hint mb-3">
        Start from a baseline template and tailor it to your workspace.
      </p>
      {isLoading ? (
        <p className="text-sm text-tg-hint">Loading templates...</p>
      ) : (
        <div className="space-y-2">
          {templates.map((template, idx) => (
            <button
              key={template.id ?? template.title}
              onClick={() => {
                setLoadingIdx(idx);
                mutation.mutate(template);
              }}
              disabled={mutation.isPending}
              className="w-full text-left bg-tg-secondary rounded-xl p-4 flex justify-between items-center disabled:opacity-50"
            >
              <div>
                <p className="font-medium">{template.title}</p>
                {template.description && (
                  <p className="text-xs text-tg-hint mt-0.5">{template.description}</p>
                )}
                <div className="flex gap-1 mt-1 flex-wrap">
                  {template.tags.map((t) => (
                    <span key={t} className="text-xs bg-tg-bg px-2 py-0.5 rounded">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
              <span className="text-sm text-tg-button font-medium">
                {loadingIdx === idx && mutation.isPending ? '...' : 'Use →'}
              </span>
            </button>
          ))}
        </div>
      )}
      {mutation.isError && (
        <p className="text-red-500 text-xs mt-3">{(mutation.error as Error).message}</p>
      )}
    </div>
  );
}
