import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { listVersions } from '../lib/api.js';

interface VersionLike {
  id: string;
  semver: string;
  created_at: string;
  contentJson?: {
    steps?: Array<{ text: string }>;
    checklistItems?: Array<{ text: string }>;
  };
}

export function VersionHistoryPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = useQuery({
    queryKey: ['version-history', id],
    queryFn: () => listVersions(id!),
    enabled: !!id,
  });

  const versions = (data?.data ?? []) as unknown as VersionLike[];
  const [leftId, setLeftId] = useState<string>('');
  const [rightId, setRightId] = useState<string>('');

  const left = versions.find((v) => v.id === (leftId || versions[1]?.id));
  const right = versions.find((v) => v.id === (rightId || versions[0]?.id));

  const diff = useMemo(() => {
    if (!left || !right) return { stepsAdded: [], stepsRemoved: [], checksAdded: [], checksRemoved: [] };

    const leftSteps = new Set((left.contentJson?.steps ?? []).map((s) => s.text));
    const rightSteps = new Set((right.contentJson?.steps ?? []).map((s) => s.text));
    const leftChecks = new Set((left.contentJson?.checklistItems ?? []).map((s) => s.text));
    const rightChecks = new Set((right.contentJson?.checklistItems ?? []).map((s) => s.text));

    return {
      stepsAdded: Array.from(rightSteps).filter((x) => !leftSteps.has(x)),
      stepsRemoved: Array.from(leftSteps).filter((x) => !rightSteps.has(x)),
      checksAdded: Array.from(rightChecks).filter((x) => !leftChecks.has(x)),
      checksRemoved: Array.from(leftChecks).filter((x) => !rightChecks.has(x)),
    };
  }, [left, right]);

  if (isLoading) return <div className="p-4 text-sm text-tg-hint">Loading versions...</div>;

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">Version History & Diff</h1>

      <div className="grid grid-cols-2 gap-2 mb-4">
        <select title="Base version" aria-label="Base version" className="bg-tg-secondary rounded-lg px-2 py-2 text-sm" value={left?.id ?? ''} onChange={(e) => setLeftId(e.target.value)}>
          {versions.map((v) => (
            <option key={v.id} value={v.id}>{v.semver}</option>
          ))}
        </select>
        <select title="Compare version" aria-label="Compare version" className="bg-tg-secondary rounded-lg px-2 py-2 text-sm" value={right?.id ?? ''} onChange={(e) => setRightId(e.target.value)}>
          {versions.map((v) => (
            <option key={v.id} value={v.id}>{v.semver}</option>
          ))}
        </select>
      </div>

      <DiffList title="Steps Added" items={diff.stepsAdded} tone="text-green-700" />
      <DiffList title="Steps Removed" items={diff.stepsRemoved} tone="text-red-700" />
      <DiffList title="Checklist Added" items={diff.checksAdded} tone="text-green-700" />
      <DiffList title="Checklist Removed" items={diff.checksRemoved} tone="text-red-700" />
    </div>
  );
}

function DiffList({ title, items, tone }: { title: string; items: string[]; tone: string }) {
  return (
    <div className="bg-tg-secondary rounded-xl p-3 mb-2">
      <p className="font-medium mb-1">{title}</p>
      {items.length === 0 ? <p className="text-xs text-tg-hint">No changes</p> : (
        <ul className="list-disc pl-5 text-sm">
          {items.map((item) => (
            <li key={`${title}-${item}`} className={tone}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
