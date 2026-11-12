import type { TaskContextEntry, TaskManifest } from './model';

/**
 * Consistency of the Task resources of one Specification across files, pure. A store reports these
 * issues on every read and refuses a change that would add one; they are never a reason to refuse a
 * whole read, so a Task removed or damaged by hand affects only that Task (Q10, G6):
 *
 * - `dangling`: an index entry without its folder or without `task.yaml`; the Task cannot start, and
 *   neither can its dependents;
 * - `unregistered`: a folder below `tasks/` that the index does not list; never executed;
 * - `broken`: a Task run record whose Task is not registered (its folder or index entry is gone), or
 *   a run that contradicts the Task's status (a `draft` that ran, a `cancelled` Task with an active
 *   step);
 * - `dependency`: a dependency on a Task that is not registered, or on a dangling one;
 * - `cycle`: one per Task that lies on a dependency cycle, so a second cycle is a new issue.
 */

export type TaskResourceIssue =
  | {
      readonly kind: 'dangling';
      readonly taskId: string;
      readonly reason: 'missing-folder' | 'missing-manifest';
    }
  | { readonly kind: 'unregistered'; readonly taskId: string }
  | {
      readonly kind: 'broken';
      readonly taskId: string;
      readonly reason: 'unregistered-run' | 'draft-with-run' | 'cancelled-while-active';
    }
  | {
      readonly kind: 'dependency';
      readonly taskId: string;
      readonly dependency: string;
      readonly reason: 'unknown' | 'dangling';
    }
  | { readonly kind: 'cycle'; readonly taskId: string };

/** What the validation needs of a Task run record: its position and whether it has history. */
export interface TaskRunSummary {
  readonly taskId: string;
  readonly state: 'not-started' | 'active' | 'ready' | 'terminal';
  readonly attempts: number;
}

export interface TaskResourceState {
  /** The ids of `tasks/index.yaml` in order; empty when there is no index. */
  readonly index: readonly string[];
  /** The manifests of the registered Tasks that have one, by id. */
  readonly manifests: ReadonlyMap<string, TaskManifest>;
  /** The folder names below `tasks/`. */
  readonly folders: readonly string[];
  readonly runs: readonly TaskRunSummary[];
}

/** The issues of a state, in a stable order (by kind, then Task id). */
export function validateTaskResources(state: TaskResourceState): TaskResourceIssue[] {
  const issues: TaskResourceIssue[] = [];
  const registered = new Set(state.index);
  const folders = new Set(state.folders);
  const dangling = new Set<string>();
  for (const taskId of state.index) {
    if (!state.manifests.has(taskId)) {
      dangling.add(taskId);
      issues.push({
        kind: 'dangling',
        taskId,
        reason: folders.has(taskId) ? 'missing-manifest' : 'missing-folder',
      });
    }
  }

  for (const folder of [...folders].sort()) {
    if (!registered.has(folder)) {
      issues.push({ kind: 'unregistered', taskId: folder });
    }
  }

  for (const run of [...state.runs].sort((left, right) => (left.taskId < right.taskId ? -1 : 1))) {
    const manifest = state.manifests.get(run.taskId);
    if (!manifest) {
      issues.push({ kind: 'broken', taskId: run.taskId, reason: 'unregistered-run' });
    } else if (manifest.status === 'draft' && (run.state !== 'not-started' || run.attempts > 0)) {
      issues.push({ kind: 'broken', taskId: run.taskId, reason: 'draft-with-run' });
    } else if (manifest.status === 'cancelled' && run.state === 'active') {
      issues.push({ kind: 'broken', taskId: run.taskId, reason: 'cancelled-while-active' });
    }
  }

  for (const taskId of state.index) {
    for (const dependency of state.manifests.get(taskId)?.dependsOn ?? []) {
      if (!registered.has(dependency) || dangling.has(dependency)) {
        issues.push({
          kind: 'dependency',
          taskId,
          dependency,
          reason: registered.has(dependency) ? 'dangling' : 'unknown',
        });
      }
    }
  }

  for (const taskId of tasksOnCycles(
    new Map([...state.manifests].map(([taskId, manifest]) => [taskId, manifest.dependsOn])),
  )) {
    issues.push({ kind: 'cycle', taskId });
  }

  return issues;
}

/**
 * Every Task that lies on a dependency cycle, in id order: a Task that reaches itself through its
 * dependencies. At most `TASKS_PER_SPECIFICATION_MAX` Tasks, so one walk per Task is cheap.
 */
function tasksOnCycles(graph: ReadonlyMap<string, readonly string[]>): string[] {
  const onCycle = (start: string): boolean => {
    const seen = new Set<string>();
    const pending = [...(graph.get(start) ?? [])];
    while (pending.length > 0) {
      const next = pending.pop() ?? start;
      if (next === start) {
        return true;
      }

      if (!seen.has(next)) {
        seen.add(next);
        pending.push(...(graph.get(next) ?? []));
      }
    }

    return false;
  };

  return [...graph.keys()].filter(onCycle).sort();
}

/** Stable identity of an issue, to compare the issues of two states. */
export const taskResourceIssueKey = (issue: TaskResourceIssue): string => JSON.stringify(issue);

/**
 * Where the references of a Task's context exist. Supplied by the caller that creates or edits a
 * Task (it reads the Specification registry, the project documentation and the checkout); the
 * parser never checks existence.
 */
export interface TaskContextLookup {
  readonly specificationDocument: (id: string) => boolean;
  readonly projectDocument: (id: string) => boolean;
  /** A file or folder exists, or a glob matches at least one file. */
  readonly path: (path: string) => boolean;
}

export interface TaskContextIssue {
  /** Position in the context list, from 0. */
  readonly index: number;
  readonly entry: TaskContextEntry;
  /** `not-registered`: a `task-document` entry names no document of the Task's registry. */
  readonly reason: 'not-registered' | 'not-found';
}

/**
 * The context entries whose reference does not resolve, in list order: a `task-document` against
 * the manifest's own registry, every other reference kind through `lookup`. `instructions` always
 * resolve. Whether an issue refuses the change or only marks the entry stale (`entry.required`) is
 * the caller's decision.
 */
export function validateTaskContext(
  manifest: Pick<TaskManifest, 'documents' | 'context'>,
  lookup: TaskContextLookup,
): TaskContextIssue[] {
  const registered = new Set(manifest.documents.map((document) => document.id));
  const issues: TaskContextIssue[] = [];
  for (const [index, entry] of (manifest.context ?? []).entries()) {
    switch (entry.kind) {
      case 'task-document':
        if (!registered.has(entry.id)) {
          issues.push({ index, entry, reason: 'not-registered' });
        }

        break;
      case 'specification-document':
        if (!lookup.specificationDocument(entry.id)) {
          issues.push({ index, entry, reason: 'not-found' });
        }

        break;
      case 'project-document':
        if (!lookup.projectDocument(entry.id)) {
          issues.push({ index, entry, reason: 'not-found' });
        }

        break;
      case 'path':
        if (!lookup.path(entry.path)) {
          issues.push({ index, entry, reason: 'not-found' });
        }

        break;
      case 'instructions':
        break;
    }
  }

  return issues;
}
