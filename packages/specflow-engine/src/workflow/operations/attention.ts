import { findStep } from '@nevo/workflow';

import type { AttentionAction, AttentionItem, AttentionItemReason } from '../attention/model';
import type { ContinuationDecision } from '../continuation/resolve';
import type { ExecutionCatalogue } from '../definitions/catalogue';
import type { WorkflowDefinition } from '../definitions/model';
import {
  isTaskClosed,
  isTaskEscalated,
  taskReadiness,
  tasksOpenAtCompletion,
  type BlockingTask,
  type OpenTask,
} from '../tasks/tasks';
import type { ExecutionTask, WorkflowRun, WorkflowSubject } from '../state/model';
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
 * - a Task on hold that the user has to resume or cancel ({@link heldTaskAttention}): escalated,
 *   waited on directly by an open Task, or refusing the finish of the Specification's active step to
 *   `completed`, unless the Specification's item already names it;
 * - a run that has not ended whose pinned workflow is missing or changed: `definition-changed`
 *   (its next operation fails with `WORKFLOW_DEFINITION_CHANGED`);
 * - nothing for a subject that is being worked on, has not started or has ended, and for a Task
 *   that is neither `ready` nor such a hold.
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
  let finish: HeldTaskInput['finish'];
  if (specification) {
    const subject: WorkflowSubject = { kind: 'specification', specId: specification.specId };
    const run = specification.run;
    const definition = pinnedDefinitionIfUnchanged(catalogue, run);
    const position = run.position;
    const step =
      definition && position.state === 'active' ? findStep(definition, position.step) : undefined;
    if (!definition) {
      changed(subject, run);
    } else if (position.state === 'ready') {
      add(subject, continuationOf(run, definition, catalogue), definition);
    } else if (step?.kind === 'wait') {
      add(subject, waitDecision(step.id, tasks, broken), definition);
    } else if (step?.kind === 'work') {
      // The rule the finish and the projection ask (`tasks-open`), on the current Tasks.
      const completes = step.transitions.find(
        (transition) =>
          transition.target.kind === 'terminal' && transition.target.outcome === 'completed',
      );
      const open = completes ? tasksOpenAtCompletion(subject, completes.target, tasks, broken) : [];
      finish = open.length > 0 ? { step: step.id, stepTitle: step.title, open } : undefined;
    }
  }

  const named = new Set(
    items.flatMap((entry) => (entry.subject.kind === 'specification' ? (entry.taskIds ?? []) : [])),
  );
  const held = new Map(
    heldTaskAttention({ specId: snapshot.specId, tasks, named, ...(finish ? { finish } : {}) }).map(
      (entry) => [entry.subject.kind === 'task' ? entry.subject.taskId : '', entry] as const,
    ),
  );

  for (const task of tasks) {
    // A held Task is never `ready`, so it has no other item.
    const hold = held.get(task.taskId);
    if (hold) {
      items.push(hold);
      continue;
    }

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

export interface HeldTaskInput {
  readonly specId: string;
  /** The readable Tasks (`executionTasks`). */
  readonly tasks: readonly ExecutionTask[];
  /** The Tasks the Specification's own item names (`task-escalated`, `tasks-stuck`). */
  readonly named: ReadonlySet<string>;
  /**
   * The Specification's active work step when its finish to `completed` is refused now
   * (`tasksOpenAtCompletion`): the step, its title and the open Tasks that refuse it.
   */
  readonly finish?: {
    readonly step: string;
    readonly stepTitle: string;
    readonly open: readonly OpenTask[];
  };
}

/**
 * The attention of the Tasks on hold that the user has to resume or cancel (owner decision
 * 2026-11-16: Requires attention means the user must act; the On hold status alone is never
 * enough). At most one item per held Task that no Specification item names (`named`), in Task
 * order:
 *
 * - escalated (`statusChange.source: escalation`): `task-escalated` on the Task;
 * - otherwise `on-hold-blocking` with what it holds up now (`blocks`): the open Tasks that wait on it
 *   directly (`taskReadiness` names it in `waitingFor`), and the Specification's active step whose
 *   finish to `completed` it refuses (`finish`, which Close needs);
 * - nothing for a hold that nothing waits on and that blocks no finish.
 *
 * Each offers `resume-task`, with `cancel-task` as the alternative. Pure.
 */
export function heldTaskAttention(input: HeldTaskInput): AttentionItem[] {
  const items: AttentionItem[] = [];
  for (const task of input.tasks) {
    if (task.status !== 'on-hold' || isTaskClosed(task) || input.named.has(task.taskId)) {
      continue;
    }

    const subject = { kind: 'task', specId: input.specId, taskId: task.taskId } as const;
    const resume = { action: 'resume-task', secondaryAction: 'cancel-task' } as const;
    if (isTaskEscalated(task)) {
      items.push(
        item(subject, 'task-escalated', {
          ...resume,
          message:
            'It escalated to the specification and is on hold (its hold reason is the feedback): resume it, or cancel it.',
        }),
      );
      continue;
    }

    const dependents = input.tasks
      .filter((candidate) => !isTaskClosed(candidate) && waitsOn(candidate, task, input.tasks))
      .map((candidate) => candidate.taskId)
      .sort();
    const finish = input.finish?.open.some(
      (open) => open.taskId === task.taskId && open.cause === 'on-hold',
    )
      ? input.finish
      : undefined;
    if (dependents.length === 0 && !finish) {
      continue;
    }

    items.push(
      item(subject, 'on-hold-blocking', {
        ...(finish ? { step: finish.step, stepTitle: finish.stepTitle } : {}),
        ...resume,
        blocks: {
          ...(dependents.length > 0 ? { taskIds: dependents } : {}),
          ...(finish ? { finish: finish.step } : {}),
        },
      }),
    );
  }

  return items;
}

/** `task` waits on `dependency` directly: its readiness names it among the open dependencies. */
function waitsOn(
  task: ExecutionTask,
  dependency: ExecutionTask,
  tasks: readonly ExecutionTask[],
): boolean {
  const readiness = taskReadiness(task, tasks);

  return readiness.kind === 'dependencies' && readiness.waitingFor.includes(dependency.taskId);
}

/**
 * The attention a Task that has not started needs for its start blockers, from its action
 * projection (owner decision 2A): only a `ready` (approved) Task, and only a blocker a person has
 * to fix. A draft or a Task on hold (`status`), dependencies that can all still complete and an
 * awaited process artifact are not attention, and neither is a Task that can start. An unmet entry
 * gate is attention only once no dependency it waits for can still complete: a dependency may
 * deliver the document. One item: the most fundamental blocker wins (type, then dependencies, then
 * context, then entry gates). `broken` are the broken Tasks of the Specification: a dependency on
 * one is fixed by restoring it.
 */
export function startBlockerAttention(
  subject: Extract<WorkflowSubject, { kind: 'task' }>,
  blockers: readonly StartBlocker[],
  next: { readonly step: { readonly id: string; readonly title: string } } | undefined,
  broken: readonly string[],
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
      const taskIds = [...blocker.unsatisfiable].sort();
      const restorable = taskIds.filter((taskId) => broken.includes(taskId));

      return restorable.length > 0
        ? item(subject, 'dependency-unsatisfiable', {
            ...step,
            taskIds,
            action: 'restore-task',
            secondaryAction: 'edit-dependencies',
            message: `It depends on broken tasks: ${restorable.join(', ')}. Restore their files from Git, or edit its dependencies.`,
          })
        : item(subject, 'dependency-unsatisfiable', { ...step, taskIds });
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

  const waiting = blockers.some(
    (blocker) => blocker.kind === 'dependencies' && blocker.unsatisfiable.length === 0,
  );
  for (const blocker of blockers) {
    if (blocker.kind === 'gates-unsatisfied' && !waiting) {
      return item(subject, 'entry-gate-unsatisfied', {
        ...step,
        message: `${quoted(next?.step.title)}cannot start until ${blocker.gates.map((gate) => gate.label).join('; ')}.`,
      });
    }
  }

  return undefined;
}

/** The primary and the alternative action of each reason. */
const ACTIONS_OF: Readonly<
  Record<AttentionItemReason, readonly [AttentionAction, AttentionAction?]>
> = {
  'owner-action': ['start-step'],
  'human-step': ['start-step'],
  'session-unavailable': ['start-step'],
  'archetype-missing': ['configure-archetype'],
  'provider-not-chosen': ['configure-archetype'],
  'model-missing': ['configure-archetype'],
  'tasks-stuck': ['review-tasks'],
  'task-escalated': ['review-tasks'],
  'task-broken': ['restore-task'],
  'definition-changed': ['confirm-definition'],
  'on-hold-blocking': ['resume-task', 'cancel-task'],
  'context-unresolved': ['edit-context'],
  'dependency-unsatisfiable': ['edit-dependencies', 'cancel-task'],
  'type-not-allowed': ['open-project-settings', 'cancel-task'],
  'definition-missing': ['open-project-settings', 'cancel-task'],
  'entry-gate-unsatisfied': ['satisfy-gate'],
};

type ItemFields = Partial<Omit<AttentionItem, 'subject' | 'reason' | 'actor'>>;

function item(
  subject: WorkflowSubject,
  reason: AttentionItemReason,
  fields: ItemFields,
): AttentionItem {
  const { message, action, secondaryAction, ...rest } = fields;
  // An item that names its own action names its alternative too (or none).
  const [primary, secondary] =
    action !== undefined ? [action, secondaryAction] : ACTIONS_OF[reason];

  return {
    subject,
    ...rest,
    reason,
    // Every item the Engine derives today waits for the owner: the gates and the steps it derives
    // them from name no other actor.
    actor: 'owner',
    action: primary,
    ...(secondary !== undefined ? { secondaryAction: secondary } : {}),
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
  // Every Task is closed but the wait did not end: there is no Task to review, only a return.
  const closed = reason === 'tasks-stuck' && (decision.blocking ?? []).length === 0;

  return item(subject, reason, {
    ...fields,
    ...(title !== undefined ? { stepTitle: title } : {}),
    ...(closed ? { action: 'return-to-step' as const } : {}),
  });
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

/** At most five ids, then how many more: the item's `blocks.taskIds` holds them all. */
const listed = (ids: readonly string[]) =>
  ids.length > 5 ? `${ids.slice(0, 5).join(', ')} (+${String(ids.length - 5)})` : ids.join(', ');

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
      return `${step}continues the previous step's Session, but that step has no Session to continue: start it yourself or in a new Session.`;
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
    case 'on-hold-blocking': {
      const blocks = [
        ...(fields.blocks?.taskIds ? [`holds up ${listed(fields.blocks.taskIds)}`] : []),
        ...(fields.blocks?.finish !== undefined ? [`keeps ${step}from finishing`] : []),
      ];

      return `It is on hold and ${blocks.join(' and ')}: resume it, or cancel it.`;
    }

    case 'dependency-unsatisfiable':
      return `It depends on tasks that can no longer complete: ${(fields.taskIds ?? []).join(', ')}. Edit its dependencies or cancel it.`;
    default:
      // The other reasons always carry their own message.
      return `${step}needs your attention.`;
  }
}
