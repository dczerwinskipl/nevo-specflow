import type { AttentionItem } from '../attention/model';
import type { ContinuationDecision } from '../continuation/resolve';
import type { ExecutionCatalogue } from '../definitions/catalogue';
import { findStep } from '../core';
import type { WorkflowSubject } from '../state/model';
import type { ExecutionSnapshot } from '../state/store';
import { continuationOf, waitDecision } from './advance';
import { executionTasks, pinnedDefinitionIfUnchanged } from './loaded-execution';

/**
 * The attention items of a Specification's execution, derived from its canonical state, the pinned
 * definitions and the current archetypes; the same decisions the operations return
 * (`continuationOf`, `waitDecision`):
 *
 * - a subject `ready` on a step: what its last event decided (a finished attempt's transition with
 *   the Session that finished it, or an owner return), when the owner has to act;
 * - a Specification active on its wait step: `task-escalated` or `tasks-stuck`;
 * - nothing for a subject that is being worked on, has not started or has ended, for a broken Task
 *   (`executionTasks`), for a Task that is not `ready`, and for a run whose pinned workflow is
 *   missing or changed (its next operation fails with `WORKFLOW_DEFINITION_CHANGED`).
 *
 * The Specification comes first, then its Tasks in id order. A Specification position that does not
 * follow from its history fails with `WORKFLOW_STATE_CORRUPT`.
 */
export function deriveAttention(
  catalogue: ExecutionCatalogue,
  snapshot: ExecutionSnapshot,
): AttentionItem[] {
  const specification = snapshot.specification?.value;
  if (!specification) {
    return [];
  }

  const { tasks, broken } = executionTasks(catalogue, snapshot);
  const items: AttentionItem[] = [];
  const add = (subject: WorkflowSubject, decision: ContinuationDecision | undefined) => {
    if (decision?.kind === 'attention') {
      const { kind: _kind, ...item } = decision;
      items.push({ subject, ...item });
    }
  };

  const run = specification.run;
  const definition = pinnedDefinitionIfUnchanged(catalogue, run);
  const position = run.position;
  if (definition && position.state === 'ready') {
    add(
      { kind: 'specification', specId: specification.specId },
      continuationOf(run, definition, catalogue),
    );
  } else if (
    definition &&
    position.state === 'active' &&
    findStep(definition, position.step)?.kind === 'wait'
  ) {
    add(
      { kind: 'specification', specId: specification.specId },
      waitDecision(position.step, tasks, broken),
    );
  }

  for (const task of tasks) {
    const taskDefinition = pinnedDefinitionIfUnchanged(catalogue, task.run);
    if (taskDefinition && task.status === 'ready' && task.run.position.state === 'ready') {
      add(
        { kind: 'task', specId: task.specId, taskId: task.taskId },
        continuationOf(task.run, taskDefinition, catalogue),
      );
    }
  }

  return items;
}
