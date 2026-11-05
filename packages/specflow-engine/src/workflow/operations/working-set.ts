import type { AttentionItem } from '../attention/model';
import { WorkflowError } from '../errors';
import {
  subjectKey,
  type SpecificationExecutionRecord,
  type TaskRecord,
  type WorkflowRun,
  type WorkflowSubject,
} from '../state/model';
import type { ExecutionChange, ExecutionSnapshot } from '../state/store';
import { staleAttentionKeys } from './attention';

/**
 * The records one operation reads and rewrites, collected into a single {@link ExecutionChange}.
 * Every write is planned against the revision of the snapshot it was read from.
 */
export class ExecutionWorkingSet {
  private specificationRecord: SpecificationExecutionRecord | undefined;
  private specificationChanged = false;
  private readonly taskRecords = new Map<string, TaskRecord>();
  private readonly changedTasks = new Set<string>();
  private readonly attentionSet = new Map<string, AttentionItem>();
  private readonly attentionClear = new Set<string>();
  private readonly snapshot: ExecutionSnapshot;

  constructor(snapshot: ExecutionSnapshot) {
    this.snapshot = snapshot;
    this.specificationRecord = snapshot.specification?.value;
    for (const entry of snapshot.tasks) {
      this.taskRecords.set(entry.value.taskId, entry.value);
    }
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

  task(taskId: string): TaskRecord {
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
    this.taskRecords.set(task.taskId, task);
    this.changedTasks.add(task.taskId);
  }

  setAttention(item: AttentionItem): void {
    const key = subjectKey(item.subject);
    this.attentionClear.delete(key);
    this.attentionSet.set(key, item);
  }

  clearAttention(subject: WorkflowSubject): void {
    const key = subjectKey(subject);
    this.attentionSet.delete(key);
    if (this.snapshot.attention.some((item) => subjectKey(item.subject) === key)) {
      this.attentionClear.add(key);
    }
  }

  /** The cleared items and every other stored item the planned state no longer matches. */
  private attentionToClear(): string[] {
    const stale = staleAttentionKeys(
      this.snapshot.attention.filter((item) => !this.attentionSet.has(subjectKey(item.subject))),
      (subject) =>
        subject.kind === 'specification'
          ? this.specificationRecord?.run
          : this.taskRecords.get(subject.taskId)?.run,
    );

    return [...new Set([...this.attentionClear, ...stale])];
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
      attention: { set: [...this.attentionSet.values()], clear: this.attentionToClear() },
    };
  }
}
