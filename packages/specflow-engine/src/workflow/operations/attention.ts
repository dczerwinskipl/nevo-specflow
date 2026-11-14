import { findStep } from '@nevo/workflow';

import type { AttentionAction, AttentionItem, AttentionItemReason } from '../attention/model';
import type { ContinuationDecision } from '../continuation/resolve';
import type { ExecutionCatalogue } from '../definitions/catalogue';
import type { WorkflowDefinition } from '../definitions/model';
import type { BlockingTask } from '../tasks/tasks';
import type { WorkflowRun, WorkflowSubject } from '../state/model';
import type { ExecutionSnapshot } from '../state/store';
import { continuationOf, waitDecision } from './advance';
import { executionTasks, pinnedDefinitionIfUnchanged } from './loaded-execution';
import type { StartBlocker } from './start-blockers';

/**
 * The attention items of a Specification's execution that its canonical state decides, the same
 * decisions the operations return (`continuationOf`, `waitDecision`):
 *
 * - a broken Task: `task-broken`;
 * - a subject `ready` on a step: what its last event decided (a finished attempt's transition with
 *   the Session that finished it, or an owner return), when the owner has to act;
 * - a Specification active on its wait step: `task-escalated` or `tasks-stuck` (with the Tasks to
 *   resolve);
 * - a run that has not ended whose pinned workflow is missing or changed: `definition-changed`
 *   (its next operation fails with `WORKFLOW_DEFINITION_CHANGED`);
 * - nothing for a subject that is being worked on, has not started or has ended, and for a Task
 *   that is not `ready`.
 *
 * The start blockers of a Task that has not started need the action projection (context and gates
 * are read from the documents): {@link startBlockerAttention} adds them where the projection is
 * read (`inspectActions`, `readExecution`). Broken Tasks come first, then the Specification, then
 * its Tasks in id order. A Specification position that does not follow from its history fails with
 * `WORKFLOW_STATE_CORRUPT`.
 */
export function deriveAttention(
  catalogue: ExecutionCatalogue,
  snapshot: ExecutionSnapshot,
): AttentionItem[] {
  const specification = snapshot.specification?.value;
  const { tasks, broken } = executionTasks(catalogue, snapshot);
  const items: AttentionItem[] = broken.map((taskId) =>
    item({ kind: 'task', specId: snapshot.specId, taskId }, 'task-broken', {}),
  );
  const add = (
    subject: WorkflowSubject,
    decision: ContinuationDecision | undefined,
    definition: WorkflowDefinition,
  ) => {
    if (decision?.kind === 'attention') {
      items.push(fromDecision(subject, decision, definition));
    }
  };

  const changed = (subject: WorkflowSubject, run: WorkflowRun) => {
    if (run.position.state !== 'terminal') {
      items.push(definitionChangedItem(subject, run));
    }
  };

  // Tasks run without a Specification run, so only a started Specification adds its own item.
  if (specification) {
    const subject: WorkflowSubject = { kind: 'specification', specId: specification.specId };
    const run = specification.run;
    const definition = pinnedDefinitionIfUnchanged(catalogue, run);
    const position = run.position;
    if (!definition) {
      changed(subject, run);
    } else if (position.state === 'ready') {
      add(subject, continuationOf(run, definition, catalogue), definition);
    } else if (
      position.state === 'active' &&
      findStep(definition, position.step)?.kind === 'wait'
    ) {
      add(subject, waitDecision(position.step, tasks, broken), definition);
    }
  }

  for (const task of tasks) {
    // A Task that has not started has no run: its start blockers come from the projection.
    const run = task.run;
    if (!run || task.status !== 'ready') {
      continue;
    }

    const subject: WorkflowSubject = { kind: 'task', specId: task.specId, taskId: task.taskId };
    const definition = pinnedDefinitionIfUnchanged(catalogue, run);
    if (!definition) {
      changed(subject, run);
    } else if (run.position.state === 'ready') {
      add(subject, continuationOf(run, definition, catalogue), definition);
    }
  }

  return items;
}

/**
 * The attention a Task that has not started needs for its start blockers, from its action
 * projection (owner decision 2A): only a `ready` (approved) Task, and only a blocker a person has
 * to fix. A draft or a Task on hold (`status`), dependencies that can all still complete and an
 * awaited process artifact are not attention, and neither is a Task that can start. One item: the
 * most fundamental blocker wins (type, then dependencies, then context, then entry gates).
 */
export function startBlockerAttention(
  subject: Extract<WorkflowSubject, { kind: 'task' }>,
  blockers: readonly StartBlocker[],
  next?: { readonly step: { readonly id: string; readonly title: string } },
): AttentionItem | undefined {
  if (blockers.some((blocker) => blocker.kind === 'status' || blocker.kind === 'broken')) {
    return undefined;
  }

  const step = next ? { step: next.step.id, stepTitle: next.step.title } : {};
  for (const blocker of blockers) {
    if (blocker.kind === 'type-not-allowed' || blocker.kind === 'definition-missing') {
      return item(subject, blocker.kind, { ...step, message: blocker.message });
    }
  }

  for (const blocker of blockers) {
    if (blocker.kind === 'dependencies' && blocker.unsatisfiable.length > 0) {
      return item(subject, 'dependency-unsatisfiable', {
        ...step,
        taskIds: [...blocker.unsatisfiable].sort(),
      });
    }
  }

  for (const blocker of blockers) {
    if (blocker.kind === 'context-unresolved') {
      return item(subject, 'context-unresolved', {
        ...step,
        message: `${count(blocker.entries.length, 'required context entry does', 'required context entries do')} not resolve: edit the context before the task can start.`,
      });
    }
  }

  for (const blocker of blockers) {
    if (blocker.kind === 'gates-unsatisfied') {
      return item(subject, 'entry-gate-unsatisfied', {
        ...step,
        message: `${quoted(next?.step.title)}cannot start until ${blocker.gates.map((gate) => gate.label).join('; ')}.`,
      });
    }
  }

  return undefined;
}

const ACTION_OF: Readonly<Record<AttentionItemReason, AttentionAction>> = {
  'owner-action': 'start-step',
  'human-step': 'start-step',
  'session-unavailable': 'start-step',
  'archetype-missing': 'configure-archetype',
  'provider-not-chosen': 'configure-archetype',
  'model-missing': 'configure-archetype',
  'tasks-stuck': 'review-tasks',
  'task-escalated': 'review-tasks',
  'task-broken': 'restore-task',
  'definition-changed': 'confirm-definition',
  'context-unresolved': 'edit-context',
  'dependency-unsatisfiable': 'edit-dependencies',
  'type-not-allowed': 'remove-or-cancel',
  'definition-missing': 'remove-or-cancel',
  'entry-gate-unsatisfied': 'satisfy-gate',
};

type ItemFields = Partial<Omit<AttentionItem, 'subject' | 'reason' | 'actor' | 'action'>>;

function item(
  subject: WorkflowSubject,
  reason: AttentionItemReason,
  fields: ItemFields,
): AttentionItem {
  const { message, ...rest } = fields;

  return {
    subject,
    ...rest,
    reason,
    // Every item the Engine derives today waits for the owner.
    actor: 'owner',
    action: ACTION_OF[reason],
    message: message ?? messageOf(reason, rest),
  };
}

function fromDecision(
  subject: WorkflowSubject,
  decision: Extract<ContinuationDecision, { kind: 'attention' }>,
  definition: WorkflowDefinition,
): AttentionItem {
  const { kind: _kind, reason, ...fields } = decision;
  const title = findStep(definition, decision.step)?.title;

  return item(subject, reason, { ...fields, ...(title !== undefined ? { stepTitle: title } : {}) });
}

function definitionChangedItem(subject: WorkflowSubject, run: WorkflowRun): AttentionItem {
  const position = run.position;
  const step =
    position.state === 'active' || position.state === 'ready' ? position.step : undefined;

  return item(subject, 'definition-changed', {
    ...(step !== undefined ? { step } : {}),
    message: `The workflow "${run.workflow.id}" (version ${String(run.workflow.version)}) this run is pinned to is missing or changed: its next step cannot start or finish.`,
  });
}

const quoted = (title: string | undefined) => (title === undefined ? 'The step ' : `"${title}" `);

const count = (n: number, one: string, many: string) => `${String(n)} ${n === 1 ? one : many}`;

const CAUSE_TEXT: Readonly<Record<BlockingTask['cause'], string>> = {
  draft: 'is a draft',
  'on-hold': 'is on hold',
  broken: 'is broken',
  'dependency-unsatisfiable': 'depends on a cancelled or ended task',
};

function messageOf(reason: AttentionItemReason, fields: ItemFields): string {
  const step = quoted(fields.stepTitle ?? fields.step);
  const archetype =
    fields.archetype === undefined ? 'its agent archetype' : `"${fields.archetype}"`;
  switch (reason) {
    case 'owner-action':
      return `${step}waits for you to start it.`;
    case 'human-step':
      return `${step}is done by a person: start it.`;
    case 'session-unavailable':
      return `${step}continues the previous Session, but the previous step ran in none: start it yourself or in a new Session.`;
    case 'archetype-missing':
      return `${step}cannot continue: ${archetype} is not defined.`;
    case 'provider-not-chosen':
      return `${step}cannot continue: choose a provider for ${archetype}.`;
    case 'model-missing':
      return `${step}cannot continue: choose a model of ${fields.provider ?? 'the provider'} for ${archetype}.`;
    case 'tasks-stuck': {
      const blocking = fields.blocking ?? [];

      return blocking.length === 0
        ? 'The specification cannot continue: every task is closed but the wait did not end; return it to an earlier step.'
        : `The specification cannot continue until ${count(blocking.length, 'task moves', 'tasks move')}: ${blocking.map((task) => `${task.taskId} ${CAUSE_TEXT[task.cause]}`).join(', ')}.`;
    }

    case 'task-escalated':
      return `Escalated to the specification: ${(fields.taskIds ?? []).join(', ')}. Decide each task, or return the specification to an earlier step.`;
    case 'task-broken':
      return 'The files of the task are inconsistent: restore them from Git.';
    case 'dependency-unsatisfiable':
      return `It depends on tasks that can no longer complete: ${(fields.taskIds ?? []).join(', ')}. Edit its dependencies or cancel it.`;
    default:
      // The other reasons always carry their own message.
      return `${step}needs your attention.`;
  }
}
