import { WorkflowError } from '../errors';
import {
  brokenTask,
  brokenTaskIds,
  type SpecificationExecutionRecord,
  type TaskRecord,
  type WorkflowRun,
  type WorkflowSubject,
} from '../state/model';
import type { ExecutionChange, ExecutionSnapshot } from '../state/store';

/**
 * The records one operation reads and rewrites, collected into a single {@link ExecutionChange}.
 * Every write is planned against the revision of the snapshot it was read from. A Task created here
 * is added to the Specification's Task list in the same change; a broken Task (listed without a
 * record) is refused before anything is planned on it.
 */
export class ExecutionWorkingSet {
  private specificationRecord: SpecificationExecutionRecord | undefined;
  private specificationChanged = false;
  private readonly taskRecords = new Map<string, TaskRecord>();
  private readonly changedTasks = new Set<string>();
  private readonly broken: ReadonlySet<string>;
  private readonly snapshot: ExecutionSnapshot;

  constructor(snapshot: ExecutionSnapshot) {
    this.snapshot = snapshot;
    this.specificationRecord = snapshot.specification?.value;
    for (const entry of snapshot.tasks) {
      this.taskRecords.set(entry.value.taskId, entry.value);
    }

    this.broken = new Set(brokenTaskIds(this.specificationRecord, this.tasks()));
  }

  specification(): SpecificationExecutionRecord {
    if (!this.specificationRecord) {
      throw new WorkflowError('WORKFLOW_SPECIFICATION_NOT_STARTED', 'No Specification run.');
    }

    return this.specificationRecord;
  }

  tasks(): TaskRecord[] {
    return [...this.taskRecords.values()];
  }

  /** The listed Tasks without a record, in list order. */
  brokenTasks(): string[] {
    return [...this.broken];
  }

  task(taskId: string): TaskRecord {
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

  setTask(task: TaskRecord): void {
    if (this.broken.has(task.taskId)) {
      brokenTask(task.taskId);
    }

    const specification = this.specification();
    if (!specification.taskIds.includes(task.taskId)) {
      this.specificationRecord = {
        ...specification,
        taskIds: [...specification.taskIds, task.taskId],
      };
      this.specificationChanged = true;
    }

    this.taskRecords.set(task.taskId, task);
    this.changedTasks.add(task.taskId);
  }

  change(): ExecutionChange {
    const revisions = new Map(
      this.snapshot.tasks.map((entry) => [entry.value.taskId, entry.revision] as const),
    );
    const specification = this.specificationRecord;

    return {
      ...(this.specificationChanged && specification
        ? {
            specification: {
              expected: this.snapshot.specification?.revision ?? null,
              next: specification,
            },
          }
        : {}),
      tasks: [...this.changedTasks].sort().map((taskId) => ({
        taskId,
        expected: revisions.get(taskId) ?? null,
        next: this.task(taskId),
      })),
    };
  }
}
