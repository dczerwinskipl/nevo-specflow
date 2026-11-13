import { TASK_MAIN_DOCUMENT } from '@nevo/specflow-contracts/documents';
import { OVERVIEW_DOCUMENT_ID } from '../../specs/document-rules/protection';
import { contextKey } from '../../tasks/resource/codec';
import type { TaskContextEntry, TaskManifest } from '../../tasks/resource/model';
import { validateTaskContext, type TaskContextIssue } from '../../tasks/resource/validate';
import type { TaskTypes } from '../definitions/model';
import { WorkflowError } from '../errors';
import type { ExecutionSnapshot } from '../state/store';
import { effectiveTaskTypes } from '../tasks/tasks';
import type { WorkflowDependencies } from './loaded-execution';
import { contextLookupFor } from './task-references';

/**
 * The effective Task Type policy of a Specification (D04): its run's snapshot once it started, else
 * the live binding of the archetype its manifest names (read only then).
 */
export async function effectiveTaskTypesOf(
  dependencies: Pick<WorkflowDependencies, 'catalogue' | 'references'>,
  snapshot: ExecutionSnapshot,
): Promise<TaskTypes> {
  const specification = snapshot.specification?.value;
  if (specification) {
    return effectiveTaskTypes({ specification });
  }

  const binding = dependencies.catalogue.specificationExecution(
    await dependencies.references.archetype(snapshot.specId),
  );

  return effectiveTaskTypes(binding ? { binding } : {});
}

/** The context a Task's steps read: its explicit list, or the default one. */
export interface EffectiveContext {
  readonly entries: readonly TaskContextEntry[];
  /** No explicit list: the default context (an edit writes it out). */
  readonly isDefault: boolean;
}

/**
 * The effective context of a Task, the single rule of the default: without an explicit list it is
 * `task.md`, the Task's other registered documents and the Specification overview (when the
 * Specification registers it), each required. Every start, gate and projection reads this list.
 */
export async function effectiveContextOf(
  dependencies: Pick<WorkflowDependencies, 'references'>,
  specId: string,
  manifest: Pick<TaskManifest, 'documents' | 'context'>,
): Promise<EffectiveContext> {
  if (manifest.context) {
    return { entries: manifest.context, isDefault: false };
  }

  const documents = [
    ...manifest.documents.filter((document) => document.id === TASK_MAIN_DOCUMENT.id),
    ...manifest.documents.filter((document) => document.id !== TASK_MAIN_DOCUMENT.id),
  ];
  const overview = await dependencies.references.specificationDocument(
    specId,
    OVERVIEW_DOCUMENT_ID,
  );

  return {
    isDefault: true,
    entries: [
      ...documents.map((document): TaskContextEntry => ({
        kind: 'task-document',
        id: document.id,
        required: true,
      })),
      ...(overview
        ? [
            {
              kind: 'specification-document',
              id: OVERVIEW_DOCUMENT_ID,
              required: true,
            } satisfies TaskContextEntry,
          ]
        : []),
    ],
  };
}

/**
 * The entries of a Task's effective context whose reference does not resolve now, in list order
 * (indexes into the effective list); `entries` narrows the check to some of them.
 */
export async function unresolvedContext(
  dependencies: Pick<WorkflowDependencies, 'references'>,
  specId: string,
  manifest: Pick<TaskManifest, 'documents' | 'context'>,
  entries?: readonly TaskContextEntry[],
): Promise<TaskContextIssue[]> {
  const list = (await effectiveContextOf(dependencies, specId, manifest)).entries;
  const checkedEntries = entries ?? list;
  const lookup = await contextLookupFor(dependencies.references, specId, checkedEntries);
  const checked = new Set(checkedEntries);

  return validateTaskContext({ documents: manifest.documents, context: list }, lookup).filter(
    (issue) => checked.has(issue.entry),
  );
}

function describeEntry(issue: TaskContextIssue): string {
  const entry = issue.entry;
  const what =
    entry.kind === 'path'
      ? `path "${entry.path}"`
      : entry.kind === 'instructions'
        ? 'instructions'
        : `${entry.kind} "${entry.id}"`;

  return isAwaited(issue)
    ? `${String(issue.index + 1)} (${what})`
    : `${String(issue.index + 1)} (${what}: ${issue.reason})`;
}

/**
 * A missing process artifact (`artifact: true`): the entry is awaited, not stale. It is never refused
 * on create or edit, but a required one still blocks the start of a step until it exists.
 */
export function isAwaited(issue: TaskContextIssue): boolean {
  return issue.entry.kind !== 'instructions' && issue.entry.artifact === true;
}

/** The issues that are stale references, leaving out the awaited process artifacts. */
export function staleReferences(issues: readonly TaskContextIssue[]): TaskContextIssue[] {
  return issues.filter((issue) => !isAwaited(issue));
}

/** A context entry a create or an edit refuses, by its position (from 0) and key. */
export interface InvalidContextEntry {
  readonly index: number;
  readonly key: string;
  /**
   * `required-own-artifact`: a required `task-document` artifact would be produced by the Task
   * itself, so its own start could never find it.
   */
  readonly reason: 'required-own-artifact';
}

/**
 * `WORKFLOW_INPUT_INVALID` for context entries that can never hold (`invalidContext`). The context
 * is what a Task needs before it starts (its inputs); what the Task produces is a gate: an exit gate
 * on the producing step and an entry gate on the step that consumes it.
 */
export class TaskContextInvalidError extends WorkflowError {
  readonly invalidContext: readonly InvalidContextEntry[];

  constructor(taskId: string, entries: readonly InvalidContextEntry[]) {
    super(
      'WORKFLOW_INPUT_INVALID',
      `The context of the Task "${taskId}" requires its own documents as artifacts: ${entries
        .map((entry) => `${String(entry.index + 1)} (${entry.key})`)
        .join(
          ', ',
        )}. The context lists what the Task needs before it starts; for what it produces, use an exit gate on the producing step and an entry gate on the consuming step, or mark the entry optional.`,
    );
    this.invalidContext = entries;
  }
}

/**
 * Refuse a context list that can never be satisfied: a required process artifact of the Task's own
 * documents (`task-document`, `artifact: true`). An optional one stays allowed.
 */
export function assertContextInputs(
  taskId: string,
  entries: readonly TaskContextEntry[] | undefined,
): void {
  const invalid = (entries ?? []).flatMap((entry, index): InvalidContextEntry[] =>
    entry.kind === 'task-document' && entry.required && entry.artifact === true
      ? [{ index, key: contextKey(entry), reason: 'required-own-artifact' }]
      : [],
  );
  if (invalid.length > 0) {
    throw new TaskContextInvalidError(taskId, invalid);
  }
}

/** One context entry that does not resolve, as a refusal names it. */
export interface UnresolvedContextEntry {
  /** Position in the context list, from 0. */
  readonly index: number;
  /** The entry's identity in the list (`contextKey`: `<kind>:<id>` or `path:<path>`). */
  readonly key: string;
  readonly reason: TaskContextIssue['reason'];
}

/** One required process artifact that does not exist yet, as a refusal names it. */
export interface AwaitedContextEntry {
  /** Position in the context list, from 0. */
  readonly index: number;
  readonly key: string;
}

/**
 * `WORKFLOW_TASK_CONTEXT_UNRESOLVED` with the stale references (`unresolved`) and, apart, the
 * process artifacts that do not exist yet (`awaited`).
 */
export class TaskContextUnresolvedError extends WorkflowError {
  readonly unresolved: readonly UnresolvedContextEntry[];
  readonly awaited: readonly AwaitedContextEntry[];

  constructor(taskId: string, issues: readonly TaskContextIssue[], consequence: string) {
    const stale = staleReferences(issues);
    const awaited = issues.filter(isAwaited);
    super(
      'WORKFLOW_TASK_CONTEXT_UNRESOLVED',
      [
        `The context of the Task "${taskId}"`,
        stale.length > 0
          ? ` names references that do not resolve: ${stale.map(describeEntry).join(', ')}`
          : '',
        stale.length > 0 && awaited.length > 0 ? ';' : '',
        awaited.length > 0
          ? ` awaits process artifacts that do not exist yet: ${awaited.map(describeEntry).join(', ')}`
          : '',
        `. ${consequence}`,
      ].join(''),
    );
    this.unresolved = stale.map((issue) => ({
      index: issue.index,
      key: contextKey(issue.entry),
      reason: issue.reason,
    }));
    this.awaited = awaited.map((issue) => ({ index: issue.index, key: contextKey(issue.entry) }));
  }
}

/**
 * Refuse with `WORKFLOW_TASK_CONTEXT_UNRESOLVED`, listing each entry by its position (from 1). The
 * caller decides which issues refuse (a create or an edit passes only {@link staleReferences}).
 */
export function assertContextResolved(
  taskId: string,
  issues: readonly TaskContextIssue[],
  consequence: string,
): void {
  if (issues.length > 0) {
    throw new TaskContextUnresolvedError(taskId, issues, consequence);
  }
}
