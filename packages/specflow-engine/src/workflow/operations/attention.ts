import type { AttentionItem } from '../attention/model';
import { subjectKey, type WorkflowRun, type WorkflowSubject } from '../state/model';
import type { ExecutionSnapshot } from '../state/store';
import { findTask } from './loaded-execution';

/**
 * Attention items are local while the runs are Git-tracked, so a checkout can change a run (a branch
 * switch, a pull) under an item that was recorded for another state. An item counts only while it
 * still describes its subject's position: the step it names is the subject's `ready` step; for
 * `tasks-stuck` and `task-escalated`, the Specification's active wait step. Pure.
 */
export function isAttentionCurrent(item: AttentionItem, run: WorkflowRun | undefined): boolean {
  const position = run?.position;
  if (!position) {
    return false;
  }

  if (item.reason === 'task-escalated' || item.reason === 'tasks-stuck') {
    return (
      item.subject.kind === 'specification' &&
      position.state === 'active' &&
      position.step === item.step
    );
  }

  return position.state === 'ready' && position.step === item.step;
}

export function runOf(
  snapshot: ExecutionSnapshot,
  subject: WorkflowSubject,
): WorkflowRun | undefined {
  return subject.kind === 'specification'
    ? snapshot.specification?.value.run
    : findTask(snapshot, subject.taskId)?.value.run;
}

/** Keys of the items that no longer match the run `run` returns for their subject. */
export function staleAttentionKeys(
  attention: readonly AttentionItem[],
  run: (subject: WorkflowSubject) => WorkflowRun | undefined,
): string[] {
  return attention
    .filter((item) => !isAttentionCurrent(item, run(item.subject)))
    .map((item) => subjectKey(item.subject));
}
