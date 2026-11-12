import { isDeepStrictEqual } from 'node:util';

import { initialTaskDocument } from '../../tasks/resource/codec';
import { TASK_MAIN_DOCUMENT } from '../../tasks/resource/model';
import type { ExecutionCatalogue } from '../definitions/catalogue';
import { WorkflowError } from '../errors';
import {
  brokenTask,
  manifestOf,
  type ExecutionTask,
  type SpecificationExecutionRecord,
  type WorkflowRun,
  type WorkflowSubject,
} from '../state/model';
import type { ExecutionChange, ExecutionSnapshot } from '../state/store';
import { executionTasks, findTask } from './loaded-execution';

/**
 * The records one operation reads and rewrites, collected into a single {@link ExecutionChange}.
 * Every write is planned against the revision of the snapshot it was read from, and only what
 * changed is written: a Task's manifest when its resource changed, its run record when its run did.
 * A Task created here gets, in the same change, its index entry, its manifest, its initial `task.md`
 * and its run record. A broken Task (`executionTasks`) is left out of `tasks()` and refused before
 * anything is planned on it.
 */
export class ExecutionWorkingSet {
  private specificationRecord: SpecificationExecutionRecord | undefined;
  private specificationChanged = false;
  private readonly taskRecords = new Map<string, ExecutionTask>();
  private readonly changedTasks = new Set<string>();
  /** Tasks created by this change, in creation order (their index order). */
  private readonly createdTasks: string[] = [];
  private readonly broken: ReadonlySet<string>;
  private readonly snapshot: ExecutionSnapshot;

  constructor(snapshot: ExecutionSnapshot, catalogue: ExecutionCatalogue) {
    this.snapshot = snapshot;
    this.specificationRecord = snapshot.specification?.value;
    const { tasks, broken } = executionTasks(catalogue, snapshot);
    for (const task of tasks) {
      this.taskRecords.set(task.taskId, task);
    }

    this.broken = new Set(broken);
  }

  specification(): SpecificationExecutionRecord {
    if (!this.specificationRecord) {
      throw new WorkflowError('WORKFLOW_SPECIFICATION_NOT_STARTED', 'No Specification run.');
    }

    return this.specificationRecord;
  }

  tasks(): ExecutionTask[] {
    return [...this.taskRecords.values()];
  }

  /** The broken Tasks, in id order. */
  brokenTasks(): string[] {
    return [...this.broken];
  }

  task(taskId: string): ExecutionTask {
    if (this.broken.has(taskId)) {
      brokenTask(taskId);
    }

    const task = this.taskRecords.get(taskId);
    if (!task) {
      throw new WorkflowError('WORKFLOW_SUBJECT_NOT_FOUND', `Unknown Task "${taskId}".`);
    }

    return task;
  }

  run(subject: WorkflowSubject): WorkflowRun {
    return subject.kind === 'specification'
      ? this.specification().run
      : this.task(subject.taskId).run;
  }

  setRun(subject: WorkflowSubject, run: WorkflowRun): void {
    if (subject.kind === 'specification') {
      this.specificationRecord = { ...this.specification(), run };
      this.specificationChanged = true;

      return;
    }

    this.setTask({ ...this.task(subject.taskId), run });
  }

  setTask(task: ExecutionTask): void {
    if (this.broken.has(task.taskId)) {
      brokenTask(task.taskId);
    }

    const { manifest } = findTask(this.snapshot, task.taskId);
    if (!manifest && !this.createdTasks.includes(task.taskId)) {
      this.createdTasks.push(task.taskId);
    }

    this.taskRecords.set(task.taskId, task);
    this.changedTasks.add(task.taskId);
  }

  change(): ExecutionChange {
    const specification = this.specificationRecord;
    const manifests: NonNullable<ExecutionChange['manifests']>[number][] = [];
    const runs: NonNullable<ExecutionChange['runs']>[number][] = [];
    const documents: NonNullable<ExecutionChange['documents']>[number][] = [];
    for (const taskId of [...this.changedTasks].sort()) {
      const task = this.task(taskId);
      const stored = findTask(this.snapshot, taskId);
      const manifest = manifestOf(task);
      if (!isDeepStrictEqual(stored.manifest?.value, manifest)) {
        manifests.push({ taskId, expected: stored.manifest?.revision ?? null, next: manifest });
      }

      if (!stored.manifest) {
        documents.push({ taskId, path: TASK_MAIN_DOCUMENT.path, text: initialTaskDocument(task) });
      }

      if (!isDeepStrictEqual(stored.run?.value.run, task.run)) {
        runs.push({
          taskId,
          expected: stored.run?.revision ?? null,
          next: { specId: task.specId, taskId, run: task.run },
        });
      }
    }

    const index = this.snapshot.index;
    // A created Task the index lists already was a dangling entry: its folder is written again.
    const listed = new Set(index?.value.tasks.map((entry) => entry.id) ?? []);
    const registered = this.createdTasks.filter((id) => !listed.has(id));

    return {
      ...(this.specificationChanged && specification
        ? {
            specification: {
              expected: this.snapshot.specification?.revision ?? null,
              next: specification,
            },
          }
        : {}),
      ...(registered.length > 0
        ? {
            index: {
              expected: index?.revision ?? null,
              next: {
                tasks: [...(index?.value.tasks ?? []), ...registered.map((id) => ({ id }))],
              },
            },
          }
        : {}),
      ...(manifests.length > 0 ? { manifests } : {}),
      ...(documents.length > 0 ? { documents } : {}),
      ...(runs.length > 0 ? { runs } : {}),
    };
  }
}
