import type { ContinuationDecision } from '../continuation/resolve';
import { decide, findStep, type RunPosition } from '@nevo/workflow';
import { WorkflowError } from '../errors';
import { exitGatesFor } from '../gates/evaluate';
import { assertGatesSatisfied } from '../gates/read';
import {
  assertActorShape,
  assertFinishInput,
  assertFinishInputShape,
  type FinishInput,
} from '../input-schema';
import {
  applyTaskDecisions,
  materializeTasks,
  type TaskDecision,
  type TaskProposal,
} from '../tasks/tasks';
import type { WorkflowActor, WorkflowSubject } from '../state/model';
import { assertSameSession, finishDigest } from './actors';
import {
  advance,
  applyEffects,
  continuationOf,
  settleWait,
  waitDecision,
  type AdvanceContext,
  type Decision,
} from './advance';
import {
  isoNow,
  loadSubject,
  ofSubject,
  type LoadedSubject,
  type WorkflowDependencies,
} from './loaded-execution';
import { NO_POST_ACTIONS, type PostActionResult } from './post-actions';
import { ExecutionWorkingSet } from './working-set';

export interface FinishStepInput {
  readonly subject: WorkflowSubject;
  /** The attempt the caller worked on; a stale caller never completes a newer attempt. */
  readonly step: string;
  readonly attempt: number;
  readonly input: FinishInput & {
    /**
     * Required by, and only allowed for, a step that produces Tasks: the complete list of the
     * Specification's draft Tasks after this finish (`materializeTasks`).
     */
    readonly tasks?: readonly TaskProposal[];
    /**
     * Only for a Specification step: explicit status decisions on its Tasks, applied after `tasks`
     * and before the transition's effects. One decision that is not allowed rejects the finish.
     */
    readonly taskDecisions?: readonly TaskDecision[];
  };
  /**
   * Who finished, from trusted Runtime/CLI context (never an agent-supplied value). Its class must be
   * one the step allows and the class of the attempt's actor (a person never finishes an agent's
   * attempt), and an agent attempt started in a Session is finished by that Session only.
   */
  readonly actor: WorkflowActor;
}

export interface FinishStepResult {
  readonly subject: WorkflowSubject;
  readonly transition: string;
  readonly position: RunPosition;
  readonly continuation: ContinuationDecision;
  /** The Tasks the finish drafted (created or revised). */
  readonly createdTasks: readonly string[];
  /**
   * After a Task's finish, what the Specification needs: what it does next when the
   * finish completed its wait step or took its `task-escalated` transition, `tasks-stuck`, or
   * `task-escalated` (listing every escalated Task).
   */
  readonly specification?: ContinuationDecision;
  /**
   * The request repeated the subject's last finish (same attempt, input and actor), for example after
   * a lost response: nothing changed, and the result is read from the recorded state.
   */
  readonly replayed?: true;
  /** What the host's post actions did after the finish (absent when it has none). */
  readonly postActions?: readonly PostActionResult[];
}

/**
 * Finish the active attempt of a subject and decide what follows. Finish never starts the next step
 * (except entering a wait step, which has no work); it records whether the Runtime may continue on
 * its own or the owner has to act.
 *
 * A Task transition that escalates puts the Task on hold with the feedback as its reason; a
 * Specification waiting for its Tasks takes its `task-escalated` transition, or needs the owner's
 * attention (`task-escalated`) when it declares none. The finish itself succeeds. A Specification finish
 * that would enter a wait step while a Task is `draft` or escalated is refused (`advance`), and so is
 * one that would end the run `terminal completed` while a Task is broken (`executionTasks`). A Task
 * that is not `ready` after its finish gets no continuation (`none {on-hold}`) and no attention.
 *
 * The exit gates of the step that apply to the taken transition (`when`) must hold
 * (`WORKFLOW_GATE_UNSATISFIED` otherwise), checked inside the lock before anything is written.
 *
 * The attempt records the digest of the request: repeating the same finish returns the recorded
 * result without a change (its gates are not evaluated again), and any other finish of that attempt
 * is `WORKFLOW_ATTEMPT_MISMATCH`.
 *
 * Once the change is published (outside the lock) the host's post actions run (`./post-actions.ts`,
 * for a repeated finish too); their results are `postActions`. A failed post action does not fail
 * the finish.
 */
export async function finishStep(
  dependencies: WorkflowDependencies,
  request: FinishStepInput,
): Promise<FinishStepResult> {
  const result = await recordFinish(dependencies, request);
  const postActions = await (dependencies.postActions ?? NO_POST_ACTIONS).afterStepFinished({
    subject: request.subject,
    step: request.step,
    attempt: request.attempt,
    actor: request.actor,
    replayed: result.replayed === true,
  });

  return postActions.length > 0 ? { ...result, postActions } : result;
}

function recordFinish(
  dependencies: WorkflowDependencies,
  request: FinishStepInput,
): Promise<FinishStepResult> {
  return dependencies.serialize(async () => {
    assertFinishInputShape(request.input);
    const { subject } = request;
    const snapshot = await dependencies.store.read(subject.specId);
    const loaded = loadSubject(dependencies.catalogue, snapshot, subject);
    assertFinishInput(request.input);
    assertActorShape(request.actor);
    // Only the active attempt has a Session to match; a finish of an ended attempt is a retry (or
    // a stale request) that the coordinator decides by its digest and actor.
    const position = loaded.run.position;
    if (
      position.state === 'active' &&
      position.step === request.step &&
      position.attempt === request.attempt
    ) {
      assertSameSession(loaded.run, request.actor);
    }

    const context: AdvanceContext = {
      set: new ExecutionWorkingSet(snapshot, dependencies.catalogue),
      catalogue: dependencies.catalogue,
      at: isoNow(dependencies),
    };
    const decision = decide(loaded.definition, loaded.run, {
      kind: 'finish',
      at: context.at,
      step: request.step,
      attempt: request.attempt,
      actor: request.actor,
      ...(request.input.result !== undefined ? { result: request.input.result } : {}),
      ...(request.input.feedback !== undefined ? { feedback: request.input.feedback } : {}),
      ...(request.input.artifacts !== undefined ? { artifacts: request.input.artifacts } : {}),
      requestDigest: finishDigest(request),
    });
    if (decision.replayed) {
      // The read showed the finish through a pending journal when its publication crashed: an
      // empty change publishes that journal, so the retry leaves the files complete.
      await dependencies.store.apply(subject.specId, {});

      return replayedFinish(context, loaded, decision);
    }

    const [taken] = decision.declaredEffects;
    const step = findStep(loaded.definition, request.step);
    if (taken?.source !== 'transition' || step?.kind !== 'work') {
      throw new WorkflowError('WORKFLOW_STATE_CORRUPT', 'A finish took no transition.');
    }

    const transition = taken.transition;
    const produces = step.annotations.produces === 'tasks';
    if (produces !== (request.input.tasks !== undefined)) {
      throw new WorkflowError(
        'WORKFLOW_INPUT_INVALID',
        produces
          ? `The step "${step.id}" finishes with the list of Tasks it produced.`
          : `The step "${step.id}" does not produce Tasks.`,
      );
    }

    if (subject.kind === 'task' && request.input.taskDecisions !== undefined) {
      throw new WorkflowError(
        'WORKFLOW_INPUT_INVALID',
        'Only a Specification step decides the status of Tasks.',
      );
    }

    // A Specification completes only with every Task intact: a broken Task's work is not known.
    const broken = context.set.brokenTasks();
    if (
      subject.kind === 'specification' &&
      transition.target.kind === 'terminal' &&
      transition.target.outcome === 'completed' &&
      broken.length > 0
    ) {
      throw new WorkflowError(
        'WORKFLOW_INPUT_INVALID',
        `The Specification cannot complete while Tasks are broken: ${broken.join(', ')}; restore them from Git.`,
      );
    }

    // The authoritative check of the exit gates, after every input rule and before anything is
    // planned or written. A repeated finish (above) never evaluates them again.
    await assertGatesSatisfied(
      dependencies.references,
      subject,
      'exit',
      step.id,
      exitGatesFor(step, transition.result),
    );

    context.set.setRun(subject, decision.nextRun);
    const createdTasks = produces ? draftTasks(context, request) : [];
    for (const task of applyTaskDecisions(
      context.set.tasks(),
      request.input.taskDecisions ?? [],
      context.at,
    )) {
      context.set.setTask(task);
    }

    applyEffects(context, decision.declaredEffects);
    if (subject.kind === 'task' && transition.annotations.escalate) {
      const feedback = request.input.feedback?.trim();
      context.set.setTask({
        ...context.set.task(subject.taskId),
        status: 'on-hold',
        statusChange: {
          source: 'escalation',
          at: context.at,
          ...(feedback ? { reason: feedback } : {}),
        },
      });
    }

    const held =
      subject.kind === 'task' &&
      transition.target.kind !== 'terminal' &&
      context.set.task(subject.taskId).status !== 'ready';
    const continuation: ContinuationDecision = held
      ? { kind: 'none', reason: 'on-hold' }
      : advance(context, subject, loaded.definition, decision.intent);
    const specification = subject.kind === 'task' ? settleWait(context) : undefined;
    await dependencies.store.apply(subject.specId, {
      ...context.set.change(),
      summary: `finish step ${request.step}${ofSubject(subject)} (attempt ${request.attempt})`,
    });

    return {
      subject,
      transition: transition.id,
      position: context.set.run(subject).position,
      continuation,
      createdTasks,
      ...(specification && specification.kind !== 'none' ? { specification } : {}),
    };
  });
}

/**
 * The result of a repeated finish, read from the state as it is now (the Engine may have settled
 * the wait the finish entered since): nothing is planned.
 */
function replayedFinish(
  context: AdvanceContext,
  loaded: LoadedSubject,
  decision: Decision,
): FinishStepResult {
  const { subject, definition } = loaded;
  const finished = decision.finished;
  if (finished?.outcome?.kind !== 'transition') {
    throw new WorkflowError('WORKFLOW_STATE_CORRUPT', 'A repeated finish names no transition.');
  }

  const run = decision.nextRun;
  const task = subject.kind === 'task' ? context.set.task(subject.taskId) : undefined;
  const continuation: ContinuationDecision =
    decision.intent.kind === 'await-event'
      ? waitDecision(decision.intent.step, context.set.tasks(), context.set.brokenTasks())
      : task && run.position.state !== 'terminal' && task.status !== 'ready'
        ? { kind: 'none', reason: 'on-hold' }
        : continuationOf(run, definition, context.catalogue);

  return {
    subject,
    transition: finished.outcome.transition,
    position: run.position,
    continuation,
    createdTasks: context.set
      .tasks()
      .filter(
        (candidate) =>
          candidate.origin.kind === 'produced' &&
          candidate.origin.step === finished.step &&
          candidate.origin.attempt === finished.attempt,
      )
      .map((candidate) => candidate.taskId),
    replayed: true,
  };
}

function draftTasks(context: AdvanceContext, request: FinishStepInput): readonly string[] {
  const specification = context.set.specification();
  const drafted = materializeTasks({
    specId: specification.specId,
    proposals: request.input.tasks ?? [],
    existing: context.set.tasks(),
    allowedTypes: specification.taskTypes,
    taskType: (id) => context.catalogue.taskType(id),
    workflow: (id) => context.catalogue.workflow(id),
    origin: { kind: 'produced', step: request.step, attempt: request.attempt },
    at: context.at,
  });
  for (const task of drafted.changed) {
    context.set.setTask(task);
  }

  return drafted.created;
}
