import type { TFunction } from 'i18next';
import type { IconName } from '@nevo/ui';
import type { TreeRowState } from '../../../../shared/document-tree';
import { isArtifact, referenceOf, type ContextRow, type TaskContextEntry } from './contextModel';

/** What the context rows know about the documents they name. */
export interface ContextNames {
  /** Task documents by id: their path in the Task folder (`task.md`). */
  readonly taskDocuments: ReadonlyMap<string, string>;
  /** Specification documents by id: their file name (`overview.md`), else their title. */
  readonly specificationDocuments: ReadonlyMap<string, string>;
}

export const kindIcon: Record<TaskContextEntry['kind'], IconName> = {
  'task-document': 'file',
  'specification-document': 'file',
  'project-document': 'book-open',
  path: 'folder',
  instructions: 'info',
};

/** The row's name: a document's file name, the path, or the instruction text. */
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

/**
 * The row's trailing label (the shared document row's state): the problem the projection reports,
 * else when the step needs the entry. An entry that does not resolve is attention; an awaited
 * artifact is expected, so it stays quiet.
 */
export function entryState(row: ContextRow, t: TFunction): TreeRowState {
  const { entry, problem } = row;
  if (problem?.kind === 'awaited') {
    return { text: t('taskAuthoring.context.awaitedLabel') };
  }

  if (problem?.kind === 'unresolved') {
    return {
      text:
        problem.reason === 'not-registered'
          ? t('taskAuthoring.context.notRegisteredLabel')
          : t('taskAuthoring.context.notFoundLabel'),
      attention: true,
    };
  }

  return {
    text: row.locked
      ? t('taskAuthoring.context.alwaysFirst')
      : entry.required
        ? t('taskAuthoring.context.required')
        : t('taskAuthoring.context.optional'),
  };
}

/**
 * What the row's tooltip says and a screen reader hears with the name: the kind, then the
 * problem's explanation, or else the entry's note.
 */
export function entryDetails(row: ContextRow, t: TFunction): string[] {
  const { entry, problem } = row;
  const ref = referenceOf(entry);
  const kind = t(`taskAuthoring.context.kind.${entry.kind}`);
  const artifact = isArtifact(entry) ? [t('taskAuthoring.context.processArtifact')] : [];
  if (problem?.kind === 'awaited') {
    return [kind, t('taskAuthoring.context.awaited', { ref }), ...artifact];
  }

  if (problem?.kind === 'unresolved') {
    return [
      kind,
      !entry.required
        ? t('taskAuthoring.context.notFoundOptional', { ref })
        : problem.reason === 'not-registered'
          ? t('taskAuthoring.context.notRegistered', { ref })
          : t('taskAuthoring.context.notFound', { ref }),
      ...artifact,
    ];
  }

  return [kind, ...(entry.note ? [entry.note] : []), ...artifact];
}
