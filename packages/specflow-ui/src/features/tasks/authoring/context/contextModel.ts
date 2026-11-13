import type { TaskResourceFacts } from '@nevo/specflow-contracts/tasks';
import type { TaskAuthoring } from '@nevo/specflow-contracts/workflow';

export type TaskContextEntry = NonNullable<TaskResourceFacts['context']>[number];

/** The main document of every Task (`TASK_MAIN_DOCUMENT`): always first, never optional. */
export const MAIN_DOCUMENT_ID = 'task';

export interface ContextRow {
  /** Position in the effective list, from 0 (the index the Engine's refusals name). */
  readonly index: number;
  readonly entry: TaskContextEntry;
  /** `task.md`: always first, cannot be removed, moved or made optional. */
  readonly locked: boolean;
  /** As the Engine reads it now. */
  readonly problem?:
    | { readonly kind: 'unresolved'; readonly reason: 'not-found' | 'not-registered' }
    | { readonly kind: 'awaited' };
}

export interface ContextView {
  /** False: the Task has no explicit list; the Engine's default context is shown. */
  readonly explicit: boolean;
  readonly rows: readonly ContextRow[];
  /** The rows that need attention, in declared order (missing, and awaited required artifacts). */
  readonly attention: readonly ContextRow[];
  /** Required references that do not resolve: the next step cannot start. */
  readonly blocking: readonly ContextRow[];
}

/**
 * The Context section's view of the Engine's effective context (`taskAuthoring.context`): the UI
 * neither computes the default list nor resolves references. Before the projection is read, an
 * explicit list is shown without states; a default one is not known yet.
 */
export function contextView(
  resource: Pick<TaskResourceFacts, 'context'>,
  authoring: TaskAuthoring | undefined,
): ContextView {
  const states =
    authoring?.context.entries ??
    (resource.context ?? []).map((entry) => ({ entry, state: 'resolved' as const }));
  const rows = states.map((state, index): ContextRow => {
    const { entry } = state;

    return {
      index,
      entry,
      locked: index === 0 && entry.kind === 'task-document' && entry.id === MAIN_DOCUMENT_ID,
      ...(state.state === 'unresolved'
        ? { problem: { kind: 'unresolved', reason: state.reason } }
        : state.state === 'awaited'
          ? { problem: { kind: 'awaited' } }
          : {}),
    };
  });

  return {
    explicit: authoring ? !authoring.context.isDefault : resource.context !== null,
    rows,
    attention: rows.filter(
      (row) =>
        row.problem?.kind === 'unresolved' ||
        (row.problem?.kind === 'awaited' && row.entry.required),
    ),
    blocking: rows.filter((row) => row.problem?.kind === 'unresolved' && row.entry.required),
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
