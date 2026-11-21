import { isDeepStrictEqual } from 'node:util';

import { canonicalJson, decide, findStep, type RunPosition } from '@nevo/workflow';

import { sha256Hex } from '../../../hash';
import type { ContinuationDecision } from '../../continuation/resolve';
import { WorkflowError } from '../../errors';
import { assertOwner } from '../../operations/actors';
import type { AdvanceContext } from '../../operations/advance';
import { completeFinish, recordedContinuation } from '../../operations/finish';
import { isoNow, loadSubject, ofSubject } from '../../operations/loaded-execution';
import type { PostActionResult } from '../../operations/post-actions';
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
import {
  agentPostActionId,
  isAttemptJournalSettled,
  type AgentAttemptJournal,
} from '../journal/model';

/**
 * The owner's decision on an agent's result held for confirmation (D17): an agent proposal that
 * takes a decision only the owner takes (an owner-authority effect such as `approve-draft-tasks`, a
 * `confirmation: owner` transition, or Task status decisions) ends its attempt and leaves the run
 * `awaiting-confirmation`. **Confirm** takes the transition with the owner as actor, as an owner's
 * own finish would (the Task decisions, the effects, the gates and what follows), and then runs the
 * attempt's commit (D15): the step finishes now. **Reject** does not take it: the step is ready to
 * start again with the owner's feedback as its handoff, and the agent's work stays as it is,
 * uncommitted (Close lists it); the Engine never commits a rejected result.
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
  /** What the attempt commit reported (none when it ran before, for a replay). */
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

/** The digest a confirm or reject records, so its retry is recognized. */
function requestDigest(kind: 'confirm' | 'reject', input: AgentResultDecisionInput): string {
  return sha256Hex(
    canonicalJson({
      kind,
      step: input.step,
      attempt: input.attempt,
      requestId: input.requestId,
      ...('feedback' in input ? { feedback: (input as RejectAgentResultInput).feedback } : {}),
    }),
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
 * The attempt's journal as the run's record says the owner decided: once confirmed, its attempt
 * commit is pending (D15); once rejected, nothing is left to run and the journal settles. Written
 * after the store change in the same section; run again before every decision, so a crash between
 * the two is repaired by the next confirm or reject of the attempt, whichever request it is.
 */
async function recordDecision(
  dependencies: AgentAttemptDependencies,
  journal: AgentAttemptJournal,
  record: AttemptRecord,
): Promise<AgentAttemptJournal> {
  const decided = record.confirmation?.state;
  const confirmation = journal.confirmation;
  if (confirmation?.state !== 'pending' || decided === undefined || decided === 'pending') {
    return journal;
  }

  const next: AgentAttemptJournal =
    decided === 'confirmed'
      ? {
          ...journal,
          confirmation: { ...confirmation, state: 'confirmed' },
          postActions: [
            {
              kind: 'attempt-commit',
              operationId: agentPostActionId(journal.operationId, 'attempt-commit'),
              stepTitle: confirmation.stepTitle,
              state: 'pending',
              declared: confirmation.declared,
            },
          ],
        }
      : { ...journal, confirmation: { ...confirmation, state: 'rejected' } };
  if (!isDeepStrictEqual(next, journal)) {
    await dependencies.admission(undefined).admitWrite();
    await dependencies.journal.publish(next);
  }

  if (isAttemptJournalSettled(next)) {
    await dependencies.journal.settle(next.operationId);
  }

  return next;
}

interface DecisionPlan<TResult> {
  readonly change: ExecutionChange;
  readonly result: TResult;
}

/** The section shared by Confirm and Reject: repair, plan, publish, record. */
async function decideInSection<TResult>(
  dependencies: AgentAttemptDependencies,
  input: AgentResultDecisionInput,
  plan: (snapshot: ExecutionSnapshot) => Promise<DecisionPlan<TResult>>,
  storeOf: (journal: AgentAttemptJournal) => AgentAttemptDependencies['workflow']['store'],
): Promise<{ readonly result: TResult; readonly attemptId: string }> {
  const { workflow } = dependencies;

  return workflow.serialize(async () => {
    const snapshot = await workflow.store.read(input.subject.specId);
    const found = await agentAttemptOf(dependencies, snapshot, input);
    const journal = await recordDecision(dependencies, found.journal, found.record);
    const planned = await plan(snapshot);
    await storeOf(journal).apply(input.subject.specId, planned.change);
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
 * Tasks, exit gates: a refusal leaves the result waiting). Its store change is attributed to the
 * attempt's last Turn, so the attempt commit, which runs once the change is published and outside
 * the lock, takes it with the rest of the attempt's work.
 *
 * Refused `WORKFLOW_ATTEMPT_MISMATCH` for an attempt that is not an agent attempt waiting for the
 * owner or was decided by another request, `WORKFLOW_POSITION_INVALID` when nothing waits. The same
 * request (`requestId`) again is replayed: nothing changes, and the attempt commit is resumed if it
 * has not run.
 */
export async function confirmAgentResult(
  dependencies: AgentAttemptDependencies,
  input: AgentResultDecisionInput,
): Promise<ConfirmAgentResultResult> {
  assertRequest(input, 'confirms an agent’s result');
  const { workflow } = dependencies;
  const operation = workflow.operation ?? ((work) => work());

  return operation(async () => {
    const { result, attemptId } = await decideInSection(
      dependencies,
      input,
      (snapshot) => planConfirm(dependencies, snapshot, input),
      (journal) => dependencies.attributedStore(journal.turns.at(-1)!.invocationId),
    );
    const postActions = await runAgentPostActions(dependencies, attemptId);

    return { ...result, postActions };
  });
}

async function planConfirm(
  dependencies: AgentAttemptDependencies,
  snapshot: ExecutionSnapshot,
  input: AgentResultDecisionInput,
): Promise<DecisionPlan<Omit<ConfirmAgentResultResult, 'postActions'>>> {
  const { workflow } = dependencies;
  const { subject } = input;
  const loaded = loadSubject(workflow.catalogue, snapshot, subject);
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
    requestDigest: requestDigest('confirm', input),
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
      },
    };
  }

  const [taken] = decision.declaredEffects;
  const step = findStep(loaded.definition, input.step);
  if (taken?.source !== 'transition' || step?.kind !== 'work') {
    throw new WorkflowError('WORKFLOW_STATE_CORRUPT', 'A confirmed result took no transition.');
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
    },
  };
}

/**
 * The owner's **Reject** of an agent's result that waits for them (D17, owner decision 2026-11-20):
 * the transition is not taken, and the step is ready to start again with the owner's `feedback` as
 * its handoff (whether the owner then starts it or asks an agent). Nothing the agent wrote is undone
 * or committed: its drafts, documents and files stay, uncommitted. Refusals and replay as
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
    const { result } = await decideInSection(
      dependencies,
      input,
      (snapshot) => Promise.resolve(planReject(dependencies, snapshot, input)),
      () => workflow.store,
    );

    return result;
  });
}

function planReject(
  dependencies: AgentAttemptDependencies,
  snapshot: ExecutionSnapshot,
  input: RejectAgentResultInput,
): DecisionPlan<RejectAgentResultResult> {
  const { workflow } = dependencies;
  const { subject } = input;
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
    requestDigest: requestDigest('reject', input),
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
