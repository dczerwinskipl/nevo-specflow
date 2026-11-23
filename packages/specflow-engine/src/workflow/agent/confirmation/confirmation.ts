import { canonicalJson, decide, findStep, type RunPosition } from '@nevo/workflow';

import { sha256Hex } from '../../../hash';
import type { ContinuationDecision } from '../../continuation/resolve';
import { WorkflowError } from '../../errors';
import { assertOwner } from '../../operations/actors';
import type { AdvanceContext } from '../../operations/advance';
import { confirmsDigestOf, describeConfirms, resultConfirmsOf } from '../../operations/confirms';
import { completeFinish, recordedContinuation } from '../../operations/finish';
import { executionTasks, isoNow, loadSubject, ofSubject } from '../../operations/loaded-execution';
import { NO_POST_ACTIONS, type PostActionResult } from '../../operations/post-actions';
import { ExecutionWorkingSet } from '../../operations/working-set';
import {
  agentAttemptBindingOf,
  pendingOwnerDecisionsOf,
  type AttemptRecord,
  type OwnerActor,
  type WorkflowSubject,
} from '../../state/model';
import type { ExecutionChange, ExecutionSnapshot } from '../../state/store';
import type { AgentAttemptDependencies } from '../dependencies';
import { runAgentPostActions } from '../finalize/post-actions';
import { isAttemptJournalSettled, type AgentAttemptJournal } from '../journal/model';

/**
 * The owner's decision on an agent's result held for confirmation (D17): an agent proposal that
 * takes a decision only the owner takes (an owner-authority effect such as `approve-draft-tasks`, a
 * `confirmation: owner` transition, or Task status decisions) ends its attempt and leaves the run
 * `awaiting-confirmation`. The attempt's commit (D15) ran when the attempt finished (owner decision
 * 2026-11-21: commit at finish), so the owner decides on committed work. **Confirm** takes the
 * transition with the owner as actor, as an owner's own finish would (the Task decisions, the
 * effects, the gates and what follows): an ordinary owner write, committed by the owner's post
 * action like an owner's finish (never attributed to the agent's Turns). **Reject** does not take
 * it: the step is ready to start again with the owner's feedback as its handoff; the agent's work
 * was committed with its attempt, so the next attempt starts from a clean checkout.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

export interface AgentResultDecisionInput {
  readonly subject: WorkflowSubject;
  /** The attempt whose result the owner was shown. */
  readonly step: string;
  readonly attempt: number;
  /** Only the owner decides, from trusted Runtime/CLI context. */
  readonly actor: OwnerActor;
  /** The idempotency key: the same request again returns the recorded decision (`replayed`). */
  readonly requestId: string;
}

export interface ConfirmAgentResultInput extends AgentResultDecisionInput {
  /**
   * The projection's `confirmsDigest` the owner was shown: what Confirm applies besides the
   * transition (the drafts it approves with their content revisions, the Task decisions).
   */
  readonly confirmsDigest: string;
}

export interface RejectAgentResultInput extends AgentResultDecisionInput {
  /** What should change; the step's next attempt reads it first (its handoff). Required. */
  readonly feedback: string;
}

export interface ConfirmAgentResultResult {
  readonly subject: WorkflowSubject;
  readonly transition: string;
  readonly position: RunPosition;
  readonly continuation: ContinuationDecision;
  /** After a Task's confirmation, what the Specification needs (as after a Task's finish). */
  readonly specification?: ContinuationDecision;
  readonly replayed?: true;
  /**
   * What the owner's post actions reported after the confirmation, as after an owner's finish (the
   * commit of the workflow state with automatic commits off); a replay runs them again.
   */
  readonly postActions: readonly PostActionResult[];
}

export interface RejectAgentResultResult {
  readonly subject: WorkflowSubject;
  readonly position: RunPosition;
  readonly continuation: ContinuationDecision;
  readonly replayed?: true;
}

function mismatch(message: string): never {
  throw new WorkflowError('WORKFLOW_ATTEMPT_MISMATCH', message);
}

function assertRequest(input: AgentResultDecisionInput, action: string): void {
  assertOwner(input.actor, action);
  if (!UUID.test(input.requestId)) {
    throw new WorkflowError('WORKFLOW_INPUT_INVALID', 'The request id is a UUID.');
  }
}

/**
 * The digest a confirm or reject records, so its retry is recognized: the same request id again
 * replays. A confirm's `confirmsDigest` is judged only when it applies, so a replay needs only the
 * request id (the CLI prints it before it runs).
 */
function requestDigest(
  kind: 'confirm' | 'reject',
  input: AgentResultDecisionInput & { readonly feedback?: string },
): string {
  return sha256Hex(
    canonicalJson({
      kind,
      step: input.step,
      attempt: input.attempt,
      requestId: input.requestId,
      ...(input.feedback !== undefined ? { feedback: input.feedback } : {}),
    }),
  );
}

/**
 * A confirm or reject of an attempt another request decided already: refused, saying what was
 * decided and what is left to do. The same request again (its `requestId`) is a replay instead.
 */
function assertNotDecidedByAnother(
  record: AttemptRecord,
  kind: 'confirm' | 'reject',
  digest: string,
): void {
  const decided = record.confirmation;
  if (decided === undefined || decided.state === 'pending' || decided.requestDigest === digest) {
    return;
  }

  const named = `${record.step}#${String(record.attempt)}`;
  const remedy =
    decided.state === 'confirmed'
      ? 'If its commit did not run (an interruption), repeat that confirm with its request id, or run `nevo-specflow workflow retry-commit` for this attempt.'
      : 'Its step is ready again: start it, or run it with an agent.';

  throw new WorkflowError(
    'WORKFLOW_ATTEMPT_MISMATCH',
    `The result of ${named} was ${decided.state} already by another request; this ${kind} changes nothing. ${remedy}`,
  );
}

function attemptRecordOf(
  dependencies: AgentAttemptDependencies,
  snapshot: ExecutionSnapshot,
  input: AgentResultDecisionInput,
): AttemptRecord | undefined {
  return loadSubject(dependencies.workflow.catalogue, snapshot, input.subject).run.attempts.find(
    (attempt) => attempt.step === input.step && attempt.attempt === input.attempt,
  );
}

/** The attempt named and its local journal: only an agent attempt (started with an agent) has a result to decide. */
async function agentAttemptOf(
  dependencies: AgentAttemptDependencies,
  snapshot: ExecutionSnapshot,
  input: AgentResultDecisionInput,
): Promise<{ readonly journal: AgentAttemptJournal; readonly record: AttemptRecord }> {
  const record = attemptRecordOf(dependencies, snapshot, input);
  const attemptId = agentAttemptBindingOf(record)?.attemptId;
  const journal = attemptId !== undefined ? await dependencies.journal.read(attemptId) : undefined;
  if (!record || !journal?.confirmation) {
    mismatch(
      `${input.step}#${String(input.attempt)} is not an agent attempt whose result waits for the owner.`,
    );
  }

  return { journal, record };
}

/**
 * The attempt's journal as the run's record says the owner decided: confirmed or rejected; once
 * nothing of the attempt is left to run (its attempt commit ran at the finalize), the journal
 * settles. Written after the store change in the same section; run again before every decision, so
 * a crash between the two is repaired by the next confirm or reject of the attempt.
 */
async function recordDecision(
  dependencies: AgentAttemptDependencies,
  journal: AgentAttemptJournal,
  record: AttemptRecord,
): Promise<AgentAttemptJournal> {
  const decided = record.confirmation?.state;
  if (journal.confirmation?.state !== 'pending' || decided === undefined || decided === 'pending') {
    return journal;
  }

  const next: AgentAttemptJournal = { ...journal, confirmation: { state: decided } };
  await dependencies.admission(undefined).admitWrite();
  await dependencies.journal.publish(next);
  if (isAttemptJournalSettled(next)) {
    await dependencies.journal.settle(next.operationId);
  }

  return next;
}

interface DecisionPlan<TResult> {
  readonly change: ExecutionChange;
  readonly result: TResult;
}

/**
 * The section shared by Confirm and Reject: repair, plan, publish (an ordinary owner write through
 * the workflow store, never attributed to the agent's Turns), record.
 */
async function decideInSection<TResult>(
  dependencies: AgentAttemptDependencies,
  input: AgentResultDecisionInput,
  plan: (snapshot: ExecutionSnapshot, record: AttemptRecord) => Promise<DecisionPlan<TResult>>,
): Promise<{ readonly result: TResult; readonly attemptId: string }> {
  const { workflow } = dependencies;

  return workflow.serialize(async () => {
    const snapshot = await workflow.store.read(input.subject.specId);
    const found = await agentAttemptOf(dependencies, snapshot, input);
    const journal = await recordDecision(dependencies, found.journal, found.record);
    const planned = await plan(snapshot, found.record);
    await workflow.store.apply(input.subject.specId, planned.change);
    const decided = attemptRecordOf(
      dependencies,
      await workflow.store.read(input.subject.specId),
      input,
    );
    if (decided) {
      await recordDecision(dependencies, journal, decided);
    }

    return { result: planned.result, attemptId: journal.operationId };
  });
}

/**
 * The owner's **Confirm** of an agent's result that waits for them (D17): the held transition is
 * taken with the owner as actor, with its Task decisions and effects (for example `approve-draft-tasks`
 * approves the drafts), judged again by every rule of a finish on the state as it is now (open
 * Tasks, exit gates: a refusal leaves the result waiting). It applies exactly what the owner was
 * shown: `confirmsDigest` must be the projection's digest of it now, else
 * `WORKFLOW_CONFIRMATION_CHANGED` names what Confirm would apply instead. Its change is an ordinary
 * owner write; the owner's post actions commit it as after an owner's finish (the agent's own work
 * was committed when its attempt finished).
 *
 * Refused `WORKFLOW_ATTEMPT_MISMATCH` for an attempt that is not an agent attempt waiting for the
 * owner or was decided by another request (saying so, and how to finish an interrupted commit),
 * `WORKFLOW_POSITION_INVALID` when nothing waits, and, with Git on, `WORKFLOW_ATTEMPT_COMMIT_REQUIRED`
 * while the attempt's own commit has not run or failed (the agent's work is committed on its own
 * first, never by the owner's commit). The same request (`requestId`) again is replayed:
 * nothing changes, and the post actions run again (an interruption before its commit is completed).
 */
export async function confirmAgentResult(
  dependencies: AgentAttemptDependencies,
  input: ConfirmAgentResultInput,
): Promise<ConfirmAgentResultResult> {
  assertRequest(input, 'confirms an agent’s result');
  if (!/^[0-9a-f]{64}$/u.test(input.confirmsDigest)) {
    throw new WorkflowError(
      'WORKFLOW_INPUT_INVALID',
      'The confirms digest is the `confirmsDigest` of the result as shown (64 hex digits).',
    );
  }

  const { workflow } = dependencies;
  const operation = workflow.operation ?? ((work) => work());

  return operation(async () => {
    const { result, attemptId } = await decideInSection(dependencies, input, (snapshot, record) =>
      planConfirm(dependencies, snapshot, record, input),
    );
    // With Git on, Confirm applied only after the attempt commit ran (`assertAttemptCommitted`).
    // With Git off an attempt commit a crash left pending is run first all the same (it records
    // nothing); then the owner's own post actions, as after an owner's finish.
    await runAgentPostActions(dependencies, attemptId);
    const { stepTitle, ...confirmed } = result;
    const postActions = await (workflow.postActions ?? NO_POST_ACTIONS).afterStepFinished({
      subject: input.subject,
      step: input.step,
      stepTitle,
      attempt: input.attempt,
      actor: input.actor,
      replayed: confirmed.replayed === true,
    });

    return { ...confirmed, postActions };
  });
}

type PlannedConfirm = Omit<ConfirmAgentResultResult, 'postActions'> & {
  readonly stepTitle: string;
};

async function planConfirm(
  dependencies: AgentAttemptDependencies,
  snapshot: ExecutionSnapshot,
  record: AttemptRecord,
  input: ConfirmAgentResultInput,
): Promise<DecisionPlan<PlannedConfirm>> {
  const { workflow } = dependencies;
  const { subject } = input;
  const { confirmsDigest: _shown, ...request } = input;
  const digest = requestDigest('confirm', request);
  assertNotDecidedByAnother(record, 'confirm', digest);
  const loaded = loadSubject(workflow.catalogue, snapshot, subject);
  const stepTitle = findStep(loaded.definition, input.step)?.title ?? input.step;
  const context: AdvanceContext = {
    set: new ExecutionWorkingSet(snapshot, workflow.catalogue),
    catalogue: workflow.catalogue,
    at: isoNow(workflow),
  };
  const decision = decide(loaded.definition, loaded.run, {
    kind: 'confirm',
    at: context.at,
    step: input.step,
    attempt: input.attempt,
    actor: input.actor,
    requestDigest: digest,
  });
  const finished = decision.finished;
  const outcome = finished?.outcome;
  if (outcome?.kind !== 'transition') {
    throw new WorkflowError('WORKFLOW_STATE_CORRUPT', 'A confirmed result takes no transition.');
  }

  if (decision.replayed) {
    return {
      change: {},
      result: {
        subject,
        transition: outcome.transition,
        position: decision.nextRun.position,
        continuation: recordedContinuation(context, loaded, decision),
        replayed: true,
        stepTitle,
      },
    };
  }

  await assertAttemptCommitted(dependencies, record);
  const [taken] = decision.declaredEffects;
  const step = findStep(loaded.definition, input.step);
  if (taken?.source !== 'transition' || step?.kind !== 'work') {
    throw new WorkflowError('WORKFLOW_STATE_CORRUPT', 'A confirmed result took no transition.');
  }

  // Exactly what the owner was shown: the drafts it approves (with their content) and the decisions.
  const confirms = await resultConfirmsOf(
    taken.transition.annotations.effects,
    executionTasks(workflow.catalogue, snapshot).tasks,
    snapshot,
    record,
    workflow.references,
  );
  if (confirmsDigestOf(confirms) !== input.confirmsDigest) {
    throw new WorkflowError(
      'WORKFLOW_CONFIRMATION_CHANGED',
      `The result of ${input.step}#${String(input.attempt)} changed since you were shown it: now ${describeConfirms(confirms)}. Read it again and confirm what you see.`,
    );
  }

  context.set.setRun(subject, decision.nextRun);
  const { continuation, specification } = await completeFinish(workflow, context, {
    loaded,
    step,
    transition: taken.transition,
    decision,
    taskDecisions: pendingOwnerDecisionsOf(finished),
    ...(outcome.feedback !== undefined ? { feedback: outcome.feedback } : {}),
  });

  return {
    change: {
      ...context.set.change(),
      summary: `confirm the result of step ${input.step}${ofSubject(subject)} (attempt ${input.attempt})`,
    },
    result: {
      subject,
      transition: taken.transition.id,
      position: context.set.run(subject).position,
      continuation,
      ...(specification && specification.kind !== 'none' ? { specification } : {}),
      stepTitle,
    },
  };
}

/**
 * With Git on, Confirm applies only once the attempt's own commit (D15) ran: while it is pending or
 * failed, the agent's documents, Task drafts and execution state are still uncommitted, and the
 * owner's commit of the transition would come first or take them. Refused
 * `WORKFLOW_ATTEMPT_COMMIT_REQUIRED` then (the projection shows the same as `actions.confirm`
 * `unavailable`); Retry commit runs it.
 */
async function assertAttemptCommitted(
  dependencies: AgentAttemptDependencies,
  record: AttemptRecord,
): Promise<void> {
  const attemptId = agentAttemptBindingOf(record)?.attemptId;
  const waiting =
    attemptId !== undefined
      ? await dependencies.workflow.holds.attemptCommit?.(attemptId)
      : undefined;
  if (waiting === undefined) {
    return;
  }

  const named = `${record.step}#${String(record.attempt)}`;

  throw new WorkflowError(
    'WORKFLOW_ATTEMPT_COMMIT_REQUIRED',
    waiting.reason === 'attempt-commit-failed'
      ? `The commit of the agent's work in ${named} failed${waiting.code !== undefined ? ` (${waiting.code})` : ''}; retry it (Retry commit), then confirm.`
      : `The commit of the agent's work in ${named} has not run yet; confirm once it has.`,
  );
}

/**
 * The owner's **Reject** of an agent's result that waits for them (D17, owner decision 2026-11-20):
 * the transition is not taken, and the step is ready to start again with the owner's `feedback` as
 * its handoff (whether the owner then starts it or runs it with an agent). Nothing the agent wrote is
 * undone: its drafts, documents and files were committed with its attempt (owner decision
 * 2026-11-21), so the next attempt starts from a clean checkout. Refusals and replay as
 * {@link confirmAgentResult}; empty feedback is `WORKFLOW_INPUT_INVALID`.
 */
export async function rejectAgentResult(
  dependencies: AgentAttemptDependencies,
  input: RejectAgentResultInput,
): Promise<RejectAgentResultResult> {
  assertRequest(input, 'rejects an agent’s result');
  const { workflow } = dependencies;
  const operation = workflow.operation ?? ((work) => work());

  return operation(async () => {
    const { result } = await decideInSection(dependencies, input, (snapshot, record) =>
      Promise.resolve(planReject(dependencies, snapshot, record, input)),
    );

    return result;
  });
}

function planReject(
  dependencies: AgentAttemptDependencies,
  snapshot: ExecutionSnapshot,
  record: AttemptRecord,
  input: RejectAgentResultInput,
): DecisionPlan<RejectAgentResultResult> {
  const { workflow } = dependencies;
  const { subject } = input;
  const digest = requestDigest('reject', input);
  assertNotDecidedByAnother(record, 'reject', digest);
  const loaded = loadSubject(workflow.catalogue, snapshot, subject);
  const context: AdvanceContext = {
    set: new ExecutionWorkingSet(snapshot, workflow.catalogue),
    catalogue: workflow.catalogue,
    at: isoNow(workflow),
  };
  const decision = decide(loaded.definition, loaded.run, {
    kind: 'reject',
    at: context.at,
    step: input.step,
    attempt: input.attempt,
    actor: input.actor,
    feedback: input.feedback,
    requestDigest: digest,
  });
  if (!decision.replayed) {
    context.set.setRun(subject, decision.nextRun);
  }

  return {
    change: decision.replayed
      ? {}
      : {
          ...context.set.change(),
          summary: `reject the result of step ${input.step}${ofSubject(subject)} (attempt ${input.attempt})`,
        },
    result: {
      subject,
      position: decision.nextRun.position,
      continuation: recordedContinuation(context, loaded, decision),
      ...(decision.replayed ? { replayed: true as const } : {}),
    },
  };
}
