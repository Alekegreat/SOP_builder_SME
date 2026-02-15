import type { SopContent } from '@sop/shared';

// ── Diff types ──
export type DiffOperation = 'added' | 'removed' | 'changed' | 'unchanged';

export interface DiffEntry<T> {
  op: DiffOperation;
  oldValue?: T;
  newValue?: T;
}

export interface FieldDiff {
  field: string;
  op: DiffOperation;
  oldValue?: string;
  newValue?: string;
}

export interface OrderedItemDiff {
  ord: number;
  op: DiffOperation;
  oldText?: string;
  newText?: string;
}

export interface SopDiff {
  fields: FieldDiff[];
  steps: OrderedItemDiff[];
  checklistItems: OrderedItemDiff[];
  exceptions: OrderedItemDiff[];
  hasChanges: boolean;
  summary: string;
}

// ── String field diff ──
function diffField(field: string, oldVal: string, newVal: string): FieldDiff {
  if (oldVal === newVal) {
    return { field, op: 'unchanged' };
  }
  return { field, op: 'changed', oldValue: oldVal, newValue: newVal };
}

// ── Ordered items diff (steps, checklist, exceptions) ──
function diffOrderedItems(
  oldItems: { ord: number; text: string }[],
  newItems: { ord: number; text: string }[],
): OrderedItemDiff[] {
  const maxLen = Math.max(oldItems.length, newItems.length);
  const diffs: OrderedItemDiff[] = [];

  for (let i = 0; i < maxLen; i++) {
    const oldItem = oldItems[i];
    const newItem = newItems[i];

    if (oldItem && newItem) {
      if (oldItem.text === newItem.text) {
        diffs.push({ ord: i, op: 'unchanged', oldText: oldItem.text, newText: newItem.text });
      } else {
        diffs.push({ ord: i, op: 'changed', oldText: oldItem.text, newText: newItem.text });
      }
    } else if (oldItem && !newItem) {
      diffs.push({ ord: i, op: 'removed', oldText: oldItem.text });
    } else if (!oldItem && newItem) {
      diffs.push({ ord: i, op: 'added', newText: newItem.text });
    }
  }

  return diffs;
}

/**
 * Generate diff between two SOP content versions
 */
export function generateDiff(oldContent: SopContent, newContent: SopContent): SopDiff {
  // Diff scalar fields
  const textFields: Array<{ field: string; key: keyof SopContent }> = [
    { field: 'Purpose', key: 'purpose' },
    { field: 'Scope', key: 'scope' },
    { field: 'Roles', key: 'roles' },
    { field: 'Preconditions', key: 'preconditions' },
    { field: 'Tools', key: 'tools' },
    { field: 'KPIs', key: 'kpis' },
    { field: 'Risks', key: 'risks' },
    { field: 'References', key: 'references' },
  ];

  const fields = textFields.map((f) =>
    diffField(f.field, oldContent[f.key] as string, newContent[f.key] as string),
  );

  // Diff ordered items
  const steps = diffOrderedItems(oldContent.steps, newContent.steps);
  const checklistItems = diffOrderedItems(oldContent.checklistItems, newContent.checklistItems);
  const exceptions = diffOrderedItems(oldContent.exceptions, newContent.exceptions);

  const hasChanges =
    fields.some((f) => f.op !== 'unchanged') ||
    steps.some((s) => s.op !== 'unchanged') ||
    checklistItems.some((c) => c.op !== 'unchanged') ||
    exceptions.some((e) => e.op !== 'unchanged');

  // Generate human-readable summary
  const changedFields = fields.filter((f) => f.op !== 'unchanged').map((f) => f.field);
  const stepsAdded = steps.filter((s) => s.op === 'added').length;
  const stepsRemoved = steps.filter((s) => s.op === 'removed').length;
  const stepsChanged = steps.filter((s) => s.op === 'changed').length;

  const parts: string[] = [];
  if (changedFields.length > 0) {
    parts.push(`Updated: ${changedFields.join(', ')}`);
  }
  if (stepsAdded > 0) parts.push(`${stepsAdded} step(s) added`);
  if (stepsRemoved > 0) parts.push(`${stepsRemoved} step(s) removed`);
  if (stepsChanged > 0) parts.push(`${stepsChanged} step(s) modified`);

  const checkAdded = checklistItems.filter((c) => c.op === 'added').length;
  const checkRemoved = checklistItems.filter((c) => c.op === 'removed').length;
  if (checkAdded > 0) parts.push(`${checkAdded} checklist item(s) added`);
  if (checkRemoved > 0) parts.push(`${checkRemoved} checklist item(s) removed`);

  const excAdded = exceptions.filter((e) => e.op === 'added').length;
  if (excAdded > 0) parts.push(`${excAdded} exception(s) added`);

  const summary = hasChanges ? parts.join('; ') : 'No changes';

  return { fields, steps, checklistItems, exceptions, hasChanges, summary };
}

/**
 * Count changes for version bump determination
 */
export function countChanges(diff: SopDiff): {
  stepsChanged: number;
  stepsTotal: number;
  scopeChanged: boolean;
  purposeChanged: boolean;
  rolesChanged: boolean;
} {
  const scopeField = diff.fields.find((f) => f.field === 'Scope');
  const purposeField = diff.fields.find((f) => f.field === 'Purpose');
  const rolesField = diff.fields.find((f) => f.field === 'Roles');

  return {
    stepsChanged: diff.steps.filter((s) => s.op !== 'unchanged').length,
    stepsTotal: diff.steps.length,
    scopeChanged: scopeField?.op === 'changed',
    purposeChanged: purposeField?.op === 'changed',
    rolesChanged: rolesField?.op === 'changed',
  };
}
