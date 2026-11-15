import type { TFunction } from 'i18next';
import type { IconName } from '@nevo/ui';
import type { SemanticSupporting } from '../../../../shared/operational-list/OperationalRow.types';
import { isArtifact, referenceOf, type ContextRow, type TaskContextEntry } from './contextModel';

/** What the context rows know about the documents they name. */
export interface ContextNames {
  /** Task documents by id: their path in the Task folder (`task.md`). */
  readonly taskDocuments: ReadonlyMap<string, string>;
  /** Specification documents by id: their title. */
  readonly specificationDocuments: ReadonlyMap<string, string>;
}

export const kindIcon: Record<TaskContextEntry['kind'], IconName> = {
  'task-document': 'file',
  'specification-document': 'file',
  'project-document': 'book-open',
  path: 'folder',
  instructions: 'info',
};

/** The row's name: a document's path or title, the path, or the instruction text. */
export function entryName(entry: TaskContextEntry, names: ContextNames): string {
  switch (entry.kind) {
    case 'task-document':
      return names.taskDocuments.get(entry.id) ?? entry.id;
    case 'specification-document':
      return names.specificationDocuments.get(entry.id) ?? entry.id;
    default:
      return referenceOf(entry);
  }
}

export function entryFacts(
  row: ContextRow,
  t: TFunction,
): readonly [string, string] | readonly [string, string, string] {
  const { entry } = row;
  const kind = t(`taskAuthoring.context.kind.${entry.kind}`);
  const need = row.locked
    ? t('taskAuthoring.context.alwaysFirst')
    : entry.required
      ? t('taskAuthoring.context.required')
      : t('taskAuthoring.context.optional');

  return isArtifact(entry)
    ? [kind, need, t('taskAuthoring.context.processArtifact')]
    : [kind, need];
}

/** The supporting line: the problem the projection reports, else `ref · note`. */
export function entrySupporting(
  row: ContextRow,
  names: ContextNames,
  t: TFunction,
): SemanticSupporting | undefined {
  const { entry, problem } = row;
  const ref = referenceOf(entry);
  if (problem?.kind === 'awaited') {
    return { text: t('taskAuthoring.context.awaited', { ref }), icon: 'clock' };
  }

  if (problem?.kind === 'unresolved' && !entry.required) {
    return {
      text: t('taskAuthoring.context.notFoundOptional', { ref }),
      tone: 'attention',
      icon: 'triangle-alert',
    };
  }

  if (problem?.kind === 'unresolved') {
    return {
      text:
        problem.reason === 'not-registered'
          ? t('taskAuthoring.context.notRegistered', { ref })
          : t('taskAuthoring.context.notFound', { ref }),
      tone: 'danger',
      icon: 'circle-alert',
    };
  }

  const name = entryName(entry, names);
  const parts = [
    // A task document is named by its path already; instructions are their own text.
    entry.kind !== 'instructions' && entry.kind !== 'task-document' && ref !== name
      ? ref
      : undefined,
    entry.note,
  ].filter((part): part is string => Boolean(part));

  return parts.length > 0 ? { text: parts.join(' · ') } : undefined;
}
