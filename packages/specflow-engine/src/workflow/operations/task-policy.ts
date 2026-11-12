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

/** The context entries of a manifest whose reference does not resolve now, in list order. */
export async function unresolvedContext(
  dependencies: Pick<WorkflowDependencies, 'references'>,
  specId: string,
  manifest: Pick<TaskManifest, 'documents' | 'context'>,
  entries: readonly TaskContextEntry[] = manifest.context ?? [],
): Promise<TaskContextIssue[]> {
  const lookup = await contextLookupFor(dependencies.references, specId, entries);
  const checked = new Set(entries);

  return validateTaskContext(manifest, lookup).filter((issue) => checked.has(issue.entry));
}

function describeEntry(issue: TaskContextIssue): string {
  const entry = issue.entry;
  const what =
    entry.kind === 'path'
      ? `path "${entry.path}"`
      : entry.kind === 'instructions'
        ? 'instructions'
        : `${entry.kind} "${entry.id}"`;

  return `${String(issue.index + 1)} (${what}: ${issue.reason})`;
}

/** One context entry that does not resolve, as a refusal names it. */
export interface UnresolvedContextEntry {
  /** Position in the context list, from 0. */
  readonly index: number;
  /** The entry's identity in the list (`contextKey`: `<kind>:<id>` or `path:<path>`). */
  readonly key: string;
  readonly reason: TaskContextIssue['reason'];
}

/** `WORKFLOW_TASK_CONTEXT_UNRESOLVED` with the entries that do not resolve (`unresolved`). */
export class TaskContextUnresolvedError extends WorkflowError {
  readonly unresolved: readonly UnresolvedContextEntry[];

  constructor(taskId: string, issues: readonly TaskContextIssue[], consequence: string) {
    super(
      'WORKFLOW_TASK_CONTEXT_UNRESOLVED',
      `The context of the Task "${taskId}" names references that do not resolve: ${issues.map(describeEntry).join(', ')}. ${consequence}`,
    );
    this.unresolved = issues.map((issue) => ({
      index: issue.index,
      key: contextKey(issue.entry),
      reason: issue.reason,
    }));
  }
}

/** Refuse with `WORKFLOW_TASK_CONTEXT_UNRESOLVED`, listing each entry by its position (from 1). */
export function assertContextResolved(
  taskId: string,
  issues: readonly TaskContextIssue[],
  consequence: string,
): void {
  if (issues.length > 0) {
    throw new TaskContextUnresolvedError(taskId, issues, consequence);
  }
}
