import type { TaskResourceFacts } from '@nevo/specflow-contracts/tasks';
import type { WorkflowActionProjection } from '@nevo/specflow-contracts/workflow';

export type TaskContextEntry = NonNullable<TaskResourceFacts['context']>[number];
type Blocker = Extract<
  WorkflowActionProjection['position'],
  { kind: 'blocked' }
>['blockers'][number];

/** The main document of every Task (`TASK_MAIN_DOCUMENT`): always first, never optional. */
export const MAIN_DOCUMENT_ID = 'task';

export interface ContextRow {
  /** Position in the effective list, from 0 (the index the Engine's refusals name). */
  readonly index: number;
  readonly entry: TaskContextEntry;
  /** `task.md`: always first, cannot be removed, moved or made optional. */
  readonly locked: boolean;
  /** As the action projection reports it (required entries only). */
  readonly problem?:
    { readonly kind: 'unresolved'; readonly reason: string } | { readonly kind: 'awaited' };
}

export interface ContextView {
  /** False: the Task has no explicit list and shows the default context. */
  readonly explicit: boolean;
  readonly rows: readonly ContextRow[];
  /** The rows that need attention, in declared order (missing, and awaited required artifacts). */
  readonly attention: readonly ContextRow[];
  /** Required references that do not resolve: the next step cannot start. */
  readonly blocking: readonly ContextRow[];
}

/**
 * The default context of a Task without an explicit list (`TaskManifestFile.context` absent):
 * `task.md`, the Task's other documents and the Specification overview, as explicit entries so the
 * first edit writes them out and nothing drops silently.
 */
export function defaultContext(
  documents: TaskResourceFacts['documents'],
  overviewDocumentId: string | undefined,
): TaskContextEntry[] {
  const ordered = [
    ...documents.filter((document) => document.id === MAIN_DOCUMENT_ID),
    ...documents.filter((document) => document.id !== MAIN_DOCUMENT_ID),
  ];

  return [
    ...ordered.map((document): TaskContextEntry => ({
      kind: 'task-document',
      id: document.id,
      required: true,
    })),
    ...(overviewDocumentId
      ? [
          {
            kind: 'specification-document',
            id: overviewDocumentId,
            required: true,
          } satisfies TaskContextEntry,
        ]
      : []),
  ];
}

function blockersOf(projection: WorkflowActionProjection | undefined): readonly Blocker[] {
  return projection?.position.kind === 'blocked' ? projection.position.blockers : [];
}

export function contextView(
  resource: Pick<TaskResourceFacts, 'context' | 'documents'>,
  projection: WorkflowActionProjection | undefined,
  overviewDocumentId: string | undefined,
): ContextView {
  const explicit = resource.context !== null;
  const entries = resource.context ?? defaultContext(resource.documents, overviewDocumentId);
  const unresolved = new Map<number, string>();
  const awaited = new Set<number>();
  for (const blocker of blockersOf(projection)) {
    if (blocker.kind === 'context-unresolved') {
      blocker.entries.forEach((entry) => unresolved.set(entry.index, entry.reason));
    } else if (blocker.kind === 'context-awaited') {
      blocker.entries.forEach((entry) => awaited.add(entry.index));
    }
  }

  const rows = entries.map((entry, index): ContextRow => {
    const reason = unresolved.get(index);

    return {
      index,
      entry,
      locked: index === 0 && entry.kind === 'task-document' && entry.id === MAIN_DOCUMENT_ID,
      ...(reason !== undefined
        ? { problem: { kind: 'unresolved', reason } }
        : awaited.has(index)
          ? { problem: { kind: 'awaited' } }
          : {}),
    };
  });

  return {
    explicit,
    rows,
    attention: rows.filter((row) => row.problem !== undefined),
    blocking: rows.filter((row) => row.problem?.kind === 'unresolved'),
  };
}

/** The entries of the view as the list an edit sends (the default written out). */
export const entriesOf = (view: ContextView) => view.rows.map((row) => row.entry);

export function withRequired(
  entries: readonly TaskContextEntry[],
  index: number,
  required: boolean,
): TaskContextEntry[] {
  return entries.map((entry, at) => (at === index ? { ...entry, required } : entry));
}

export function withoutEntry(entries: readonly TaskContextEntry[], index: number) {
  return entries.filter((_, at) => at !== index);
}

/** Moves an entry one place up (`-1`) or down (`1`); `task.md` keeps the first place. */
export function moved(
  entries: readonly TaskContextEntry[],
  index: number,
  direction: -1 | 1,
): TaskContextEntry[] {
  const target = index + direction;
  const next = [...entries];
  if (target < 0 || target >= next.length) {
    return next;
  }

  [next[index], next[target]] = [next[target]!, next[index]!];

  return next;
}

/** Whether a row can move up or down without passing the locked first entry. */
export function movable(view: ContextView, row: ContextRow) {
  const firstMovable = view.rows[0]?.locked ? 1 : 0;

  return {
    up: !row.locked && row.index > firstMovable,
    down: !row.locked && row.index < view.rows.length - 1,
  };
}

/** The identity of a reference (`contextKey` of the Engine), to tell already-added entries apart. */
export function referenceKey(entry: TaskContextEntry): string {
  switch (entry.kind) {
    case 'path':
      return `path:${entry.path}`;
    case 'instructions':
      return `instructions:${entry.text}`;
    default:
      return `${entry.kind}:${entry.id}`;
  }
}

/** What a row names: the referenced id or path, or the instruction text. */
export function referenceOf(entry: TaskContextEntry): string {
  switch (entry.kind) {
    case 'path':
      return entry.path;
    case 'instructions':
      return entry.text;
    default:
      return entry.id;
  }
}

export const isArtifact = (entry: TaskContextEntry) =>
  entry.kind !== 'instructions' && entry.artifact === true;
