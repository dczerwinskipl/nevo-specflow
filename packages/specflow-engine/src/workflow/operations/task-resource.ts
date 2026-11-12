import {
  TASK_RESOURCE_SCHEMA_VERSION,
  TaskManifestFileSchema,
} from '@nevo/specflow-contracts/documents';
import { Value } from 'typebox/value';

import { foldPathKey } from '../../specs/document-rules/document-paths';
import { contextKey, initialTaskDocument, taskManifestProblems } from '../../tasks/resource/codec';
import {
  TASK_MAIN_DOCUMENT,
  type TaskContextEntry,
  type TaskManifest,
} from '../../tasks/resource/model';
import { unregisteredTaskFiles } from '../../tasks/resource/validate';
import { WorkflowError } from '../errors';
import { isValidTaskId, TASKS_PER_SPECIFICATION_MAX } from '../limits';
import { dependencyCycle } from '../state/dependency-cycle';
import {
  taskPosition,
  type ExecutionTask,
  type OwnerActor,
  type WorkflowSubject,
} from '../state/model';
import type { ExecutionChange, ExecutionSnapshot } from '../state/store';
import { resolveTaskType } from '../tasks/tasks';
import { assertOwner } from './actors';
import { executionTasks, loadTask, type WorkflowDependencies } from './loaded-execution';
import { assertContextResolved, effectiveTaskTypesOf, unresolvedContext } from './task-policy';

/**
 * The owner's Task use cases (D04): create, edit and remove a Task as a resource of its
 * Specification, without a Specification run. Each runs under `serialize`, reads the execution
 * store once, checks everything, then applies one change; a refusal writes nothing. A Task created
 * here is a `draft` with the origin `{kind: manual, actorId}` and no run record: its first start
 * (`startTaskExecution`) validates the live task type and workflow and pins it.
 *
 * Every context reference must resolve when it is added (`WORKFLOW_TASK_CONTEXT_UNRESOLVED`); a
 * reference that stops resolving later is reported as stale and, when required, blocks the next
 * start. An edit and a removal name the manifest revision they were planned against
 * (`WORKFLOW_TASK_REVISION_CONFLICT` otherwise), as the inspection shows it.
 */

export interface TaskResourceResult {
  readonly subject: WorkflowSubject;
  readonly task: ExecutionTask;
  /** The manifest revision after the change, for the next edit or removal. */
  readonly revision: string;
}

export interface CreateTaskInput {
  readonly specId: string;
  /** Lowercase letters, digits and dashes; it names the Task folder. */
  readonly taskId: string;
  readonly title: string;
  readonly summary?: string;
  /** Immutable after creation. */
  readonly type: string;
  readonly dependsOn?: readonly string[];
  /** Absent: the default context. */
  readonly context?: readonly TaskContextEntry[];
  /** The first text of `task.md`; absent: the title and summary (`initialTaskDocument`). */
  readonly document?: string;
  /** The owner, from trusted Runtime/CLI context. */
  readonly actor: OwnerActor;
}

export interface EditTaskInput {
  readonly specId: string;
  readonly taskId: string;
  /** The manifest revision the edit was planned against. */
  readonly expectedRevision: string;
  readonly title?: string;
  /** `null` removes the summary. */
  readonly summary?: string | null;
  /** Only before the Task's first start. */
  readonly dependsOn?: readonly string[];
  /** The whole list; `null` restores the default context. */
  readonly context?: readonly TaskContextEntry[] | null;
  /** The type is immutable: naming another type is refused (`WORKFLOW_TASK_TYPE_IMMUTABLE`). */
  readonly type?: string;
  readonly actor: OwnerActor;
}

export interface RemoveTaskInput {
  readonly specId: string;
  readonly taskId: string;
  /** The manifest revision the removal was planned against. */
  readonly expectedRevision: string;
  readonly actor: OwnerActor;
}

function invalid(message: string): never {
  throw new WorkflowError('WORKFLOW_INPUT_INVALID', message);
}

function notRemovable(taskId: string, reason: string): never {
  throw new WorkflowError(
    'WORKFLOW_TASK_NOT_REMOVABLE',
    `The Task "${taskId}" cannot be removed: ${reason}.`,
  );
}

const subjectOf = (specId: string, taskId: string): WorkflowSubject => ({
  kind: 'task',
  specId,
  taskId,
});

/** The manifest must be a valid `task.yaml` (the published schema and the rules beyond it). */
function assertManifest(manifest: TaskManifest): void {
  const file = { schemaVersion: TASK_RESOURCE_SCHEMA_VERSION, ...manifest };
  if (!Value.Check(TaskManifestFileSchema, file)) {
    const [first] = [...Value.Errors(TaskManifestFileSchema, file)];
    invalid(
      `The Task "${manifest.id}" is not valid${first ? `: ${first.instancePath || '/'} ${first.message}` : ''}.`,
    );
  }

  const [problem] = taskManifestProblems(manifest);
  if (problem !== undefined) {
    invalid(`The Task "${manifest.id}" is not valid: ${problem}.`);
  }
}

/** Title and summary as stored: trimmed, an empty summary is none. */
function describedAs(title: string, summary: string | undefined) {
  const trimmed = summary?.trim();

  return { title: title.trim(), ...(trimmed ? { summary: trimmed } : {}) };
}

/**
 * Dependencies of a manual change: each names a registered Task that is not broken and not the Task
 * itself; one that is newly added must not be cancelled (it would never complete); together with
 * every other Task's dependencies they form no cycle.
 */
function assertDependencies(
  dependencies: Pick<WorkflowDependencies, 'catalogue'>,
  snapshot: ExecutionSnapshot,
  taskId: string,
  dependsOn: readonly string[],
  previous: readonly string[],
): void {
  const { tasks, broken } = executionTasks(dependencies.catalogue, snapshot);
  const byId = new Map(tasks.map((task) => [task.taskId, task] as const));
  for (const dependency of dependsOn) {
    const task = byId.get(dependency);
    if (broken.includes(dependency)) {
      invalid(`The Task "${taskId}" cannot depend on the broken Task "${dependency}".`);
    }

    if (!task || dependency === taskId) {
      invalid(`The Task "${taskId}" depends on an unknown Task "${dependency.slice(0, 80)}".`);
    }

    if (task.status === 'cancelled' && !previous.includes(dependency)) {
      invalid(`The Task "${taskId}" cannot depend on the cancelled Task "${dependency}".`);
    }
  }

  const graph = new Map(
    snapshot.manifests.map((entry) => [entry.value.id, entry.value.dependsOn] as const),
  );
  graph.set(taskId, dependsOn);
  const cycle = dependencyCycle(graph);
  if (cycle !== undefined) {
    invalid(`The Task dependencies would form a cycle at "${cycle}".`);
  }
}

/** The Task as stored after the change, with the revision the store gave its manifest. */
async function storedTask(
  dependencies: WorkflowDependencies,
  specId: string,
  taskId: string,
): Promise<TaskResourceResult> {
  const snapshot = await dependencies.store.read(specId);
  const { task, manifest } = loadTask(dependencies.catalogue, snapshot, taskId);

  return { subject: subjectOf(specId, taskId), task, revision: manifest.revision };
}

/** The Tasks of a Specification whose workflow ended (completed or abandoned) are final. */
function assertSpecificationOpen(snapshot: ExecutionSnapshot): void {
  if (snapshot.specification?.value.run.position.state === 'terminal') {
    throw new WorkflowError(
      'WORKFLOW_SPECIFICATION_ENDED',
      `The workflow of the Specification "${snapshot.specId}" ended; its Tasks can no longer change.`,
    );
  }
}

/**
 * Create a Task by hand: a `draft` with its index entry, its manifest and its `task.md`, in one
 * change and without a run record. Its type must exist and be allowed by the effective policy (the
 * Specification run's snapshot, else the live archetype binding); its dependencies must exist and
 * stay acyclic; every context reference must resolve.
 */
export function createTask(
  dependencies: WorkflowDependencies,
  input: CreateTaskInput,
): Promise<TaskResourceResult> {
  return dependencies.serialize(async () => {
    assertOwner(input.actor, 'creates a Task');
    if (!isValidTaskId(input.taskId)) {
      invalid(`The Task id "${input.taskId.slice(0, 80)}" is not a valid id.`);
    }

    const snapshot = await dependencies.store.read(input.specId);
    assertSpecificationOpen(snapshot);
    const ids = snapshot.index?.value.tasks.map((entry) => entry.id) ?? [];
    if (
      ids.includes(input.taskId) ||
      (await dependencies.store.taskFolderExists(input.specId, input.taskId)) ||
      snapshot.runs.some((entry) => entry.value.taskId === input.taskId)
    ) {
      throw new WorkflowError(
        'WORKFLOW_TASK_EXISTS',
        `The Specification has a Task "${input.taskId}" already, or its folder or run record.`,
      );
    }

    if (ids.length >= TASKS_PER_SPECIFICATION_MAX) {
      invalid(`A Specification has at most ${TASKS_PER_SPECIFICATION_MAX} Tasks.`);
    }

    const { type } = resolveTaskType({
      type: input.type,
      allowed: await effectiveTaskTypesOf(dependencies, snapshot),
      taskType: (id) => dependencies.catalogue.taskType(id),
      workflow: (id) => dependencies.catalogue.workflow(id),
    });
    const manifest: TaskManifest = {
      id: input.taskId,
      ...describedAs(input.title, input.summary),
      type: type.id,
      status: 'draft',
      dependsOn: [...(input.dependsOn ?? [])],
      origin: { kind: 'manual', actorId: input.actor.details.actorId },
      documents: [{ ...TASK_MAIN_DOCUMENT }],
      ...(input.context !== undefined ? { context: input.context } : {}),
    };
    assertManifest(manifest);
    assertDependencies(dependencies, snapshot, manifest.id, manifest.dependsOn, []);
    assertContextResolved(
      manifest.id,
      await unresolvedContext(dependencies, input.specId, manifest),
      'Replace or remove them.',
    );

    await dependencies.store.apply(input.specId, {
      index: {
        expected: snapshot.index?.revision ?? null,
        next: { tasks: [...ids.map((id) => ({ id })), { id: manifest.id }] },
      },
      manifests: [{ taskId: manifest.id, expected: null, next: manifest }],
      documents: [
        {
          taskId: manifest.id,
          path: TASK_MAIN_DOCUMENT.path,
          text: input.document ?? initialTaskDocument(manifest),
        },
      ],
    });

    return storedTask(dependencies, input.specId, manifest.id);
  });
}

/**
 * Edit a Task's title, summary, dependencies or context, against the manifest revision the caller
 * read. The type never changes. A cancelled Task, or one whose run ended, is not edited
 * (`WORKFLOW_TASK_BLOCKED`); dependencies change only before the first start. Only the context
 * entries the edit adds or changes must resolve: an entry kept as it was may have gone stale.
 */
export function editTask(
  dependencies: WorkflowDependencies,
  input: EditTaskInput,
): Promise<TaskResourceResult> {
  return dependencies.serialize(async () => {
    assertOwner(input.actor, 'edits a Task');
    const snapshot = await dependencies.store.read(input.specId);
    assertSpecificationOpen(snapshot);
    const { task, manifest: stored } = loadTask(dependencies.catalogue, snapshot, input.taskId);
    if (stored.revision !== input.expectedRevision) {
      throw new WorkflowError(
        'WORKFLOW_TASK_REVISION_CONFLICT',
        `The Task "${input.taskId}" changed since it was read; read it again and repeat the edit.`,
      );
    }

    if (input.type !== undefined && input.type !== stored.value.type) {
      throw new WorkflowError(
        'WORKFLOW_TASK_TYPE_IMMUTABLE',
        `The type of the Task "${input.taskId}" is fixed at creation; create a new Task of the type "${input.type.slice(0, 80)}" instead.`,
      );
    }

    if (task.status === 'cancelled' || taskPosition(task).state === 'terminal') {
      throw new WorkflowError(
        'WORKFLOW_TASK_BLOCKED',
        `The Task "${input.taskId}" is ${task.status === 'cancelled' ? 'cancelled' : 'ended'}; it can no longer be edited.`,
      );
    }

    const previous = stored.value;
    const dependsOn = input.dependsOn ? [...input.dependsOn] : previous.dependsOn;
    if (task.run && input.dependsOn && !sameList(dependsOn, previous.dependsOn)) {
      invalid(`The Task "${input.taskId}" has started; its dependencies can no longer change.`);
    }

    const context = input.context === null ? undefined : (input.context ?? previous.context);
    const { summary: _summary, context: _context, ...kept } = previous;
    const manifest: TaskManifest = {
      ...kept,
      ...describedAs(
        input.title ?? previous.title,
        input.summary === null ? undefined : (input.summary ?? previous.summary),
      ),
      dependsOn,
      ...(context !== undefined ? { context } : {}),
    };
    assertManifest(manifest);
    assertDependencies(dependencies, snapshot, manifest.id, dependsOn, previous.dependsOn);
    const before = new Set((previous.context ?? []).map(keptEntryKey));
    assertContextResolved(
      manifest.id,
      await unresolvedContext(
        dependencies,
        input.specId,
        manifest,
        (manifest.context ?? []).filter((entry) => !before.has(keptEntryKey(entry))),
      ),
      'Replace or remove them.',
    );

    await dependencies.store.apply(input.specId, {
      manifests: [{ taskId: manifest.id, expected: stored.revision, next: manifest }],
    });

    return storedTask(dependencies, input.specId, manifest.id);
  });
}

/** An entry is kept as it was when its reference and its `required` flag are unchanged. */
const keptEntryKey = (entry: TaskContextEntry) => `${contextKey(entry)}|${String(entry.required)}`;

const sameList = (left: readonly string[], right: readonly string[]) =>
  left.length === right.length && left.every((value, index) => value === right[index]);

/** At most this many unknown files are named in a refusal. */
const UNKNOWN_FILES_NAMED = 10;

/**
 * Remove a Task that never started: its index entry, its manifest and its registered documents in
 * one change, so its folder goes with them. Refused (`WORKFLOW_TASK_NOT_REMOVABLE`, nothing written)
 * when the Task has a run record, another Task depends on it, a change of one of its documents is
 * pending, or its folder holds a file it does not register (which removing the Task would leave
 * behind as an unregistered folder). A Task that started is cancelled instead. A dangling index entry
 * (its folder or manifest is gone) is broken and not removable here: it is repaired by hand.
 */
export function removeTask(
  dependencies: WorkflowDependencies,
  input: RemoveTaskInput,
): Promise<{ readonly subject: WorkflowSubject }> {
  return dependencies.serialize(async () => {
    assertOwner(input.actor, 'removes a Task');
    const snapshot = await dependencies.store.read(input.specId);
    const { manifest, run } = loadTask(dependencies.catalogue, snapshot, input.taskId);
    if (manifest.revision !== input.expectedRevision) {
      throw new WorkflowError(
        'WORKFLOW_TASK_REVISION_CONFLICT',
        `The Task "${input.taskId}" changed since it was read; read it again before removing it.`,
      );
    }

    if (run) {
      notRemovable(input.taskId, 'it has started; cancel it instead');
    }

    const dependents = snapshot.manifests
      .filter((entry) => entry.value.dependsOn.includes(input.taskId))
      .map((entry) => entry.value.id)
      .sort();
    if (dependents.length > 0) {
      notRemovable(input.taskId, `the Tasks ${dependents.join(', ')} depend on it`);
    }

    if (await dependencies.references.pendingDocumentChange(input.specId, input.taskId)) {
      notRemovable(input.taskId, 'a change of one of its documents is pending');
    }

    const registered = new Map(
      manifest.value.documents.map((document) => [foldPathKey(document.path), document] as const),
    );
    const files = await dependencies.store.taskFiles(input.specId, input.taskId);
    const unknown = unregisteredTaskFiles(manifest.value, files);
    if (unknown.length > 0) {
      notRemovable(
        input.taskId,
        `its folder holds files it does not register (${unknown.slice(0, UNKNOWN_FILES_NAMED).join(', ')}${unknown.length > UNKNOWN_FILES_NAMED ? ', ...' : ''}); move or register them first`,
      );
    }

    const present = new Set(files.map(foldPathKey));
    const change: ExecutionChange = {
      index: {
        expected: snapshot.index?.revision ?? null,
        next: {
          tasks: (snapshot.index?.value.tasks ?? []).filter((entry) => entry.id !== input.taskId),
        },
      },
      manifests: [{ taskId: input.taskId, expected: manifest.revision, next: null }],
      documents: [...registered]
        .filter(([key]) => present.has(key))
        .map(([, document]) => ({ taskId: input.taskId, path: document.path, text: null })),
    };
    await dependencies.store.apply(input.specId, change);

    return { subject: subjectOf(input.specId, input.taskId) };
  });
}
