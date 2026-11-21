import { isDeepStrictEqual } from 'node:util';

import { WorkflowError as CoreWorkflowError, type RunPosition } from '@nevo/workflow';

import {
  WorkspaceExecutionError,
  type WorkspaceExecutionIntent,
  type WorkspaceExecutionReceipt,
} from '../../../execution/model';
import { DocumentError } from '../../../specs/document-rules/errors';
import type { OwnedExecutionClaim } from '../../../specs/durable';
import { SpecificationError } from '../../../specs/model';
import { SpecificationBusyError, WorkflowError } from '../../errors';
import { planFinish, type FinishStepResult } from '../../operations/finish';
import { isoNow, loadSubject } from '../../operations/loaded-execution';
import type { PostActionResult } from '../../operations/post-actions';
import { planReturn } from '../../operations/return';
import { agentAttemptBindingOf } from '../../state/model';
import type { ExecutionSnapshot, WorkflowStore } from '../../state/store';
import { AttributionRefusalError, assertAgentFinishAttribution } from '../boundary';
import type { AgentAttemptDependencies } from '../dependencies';
import {
  agentPostActionId,
  type AgentAttemptJournal,
  type AgentRefusal,
  type AgentTurnBinding,
} from '../journal/model';
import { runAgentPostActions } from './post-actions';

export interface FinalizeAgentAttemptInput {
  /** The attempt's `attemptId` (its binding on the attempt record). */
  readonly attemptId: string;
  /** The ended Turn's execution claim, as the Runtime admitted it; a Turn of this attempt. */
  readonly intent: WorkspaceExecutionIntent;
  /** The native-result receipt: the Turn's process is proven stopped. */
  readonly receipt: WorkspaceExecutionReceipt;
}

/**
 * What the finalize did with the attempt (the same answer when it is run again):
 *
 * - `finished`: the proposal is published as the attempt's finish; `finish` is the finish result
 *   when this call planned it (absent when an earlier call published it), `postActions` what the
 *   post actions this call ran reported;
 * - `refused`: the re-validation refused the proposal (or the owner's return, `of: return`); the
 *   claim is settled and the attempt stays active with the refusal recorded;
 * - `returned`: the owner's recorded return request ended the attempt `returned`;
 * - `turn-ended`: the Turn ended without a proposal to publish; the attempt stays active.
 */
export type FinalizeAgentAttemptResult =
  | {
      readonly kind: 'finished';
      readonly transition: string;
      readonly finish?: FinishStepResult;
      readonly postActions: readonly PostActionResult[];
    }
  | { readonly kind: 'refused'; readonly of: 'proposal' | 'return'; readonly refusal: AgentRefusal }
  | { readonly kind: 'returned'; readonly position?: RunPosition }
  | { readonly kind: 'turn-ended' };

export type { FinalizeBoundary } from './ports';

type SectionOutcome =
  | Exclude<FinalizeAgentAttemptResult, { kind: 'finished' }>
  | {
      readonly kind: 'finished';
      readonly transition: string;
      readonly finish?: FinishStepResult;
    };

function mismatch(message: string): never {
  throw new WorkflowError('WORKFLOW_ATTEMPT_MISMATCH', message);
}

function corrupt(message: string): never {
  throw new WorkflowError('WORKFLOW_STATE_CORRUPT', message);
}

/**
 * Errors that are no verdict on the request: corrupt state, and what passes by itself (another
 * operation holds the Specification, its source is unavailable for a moment). They leave the claim
 * held and the proposal pending, so the same finalize, run again, judges it then.
 */
const NOT_REFUSALS: ReadonlySet<string> = new Set([
  'WORKFLOW_STATE_CORRUPT',
  'WORKFLOW_SPECIFICATION_BUSY',
  'SPEC_BUSY',
  'SPEC_SOURCE_UNAVAILABLE',
]);

/**
 * The refusal a pending proposal gets when the owner's return request was judged in its place: the
 * owner's decision wins, so the proposal is not applied; the agent may propose again in a later Turn
 * if the return was refused. A journal-only code, not a workflow error code.
 */
export const RETURN_REQUESTED_REFUSAL: AgentRefusal = {
  code: 'WORKFLOW_RETURN_REQUESTED',
  message: 'The owner returned the step during the Turn; the proposal was not applied.',
};

/**
 * Why a re-validation refused, when the error is a refusal of the request (the proposal or return is
 * no longer valid, or its publication was refused); anything else (a fault, corrupt state) is not a
 * refusal and leaves the claim held for recovery.
 */
function refusalOf(error: unknown): AgentRefusal | undefined {
  const refused =
    (error instanceof CoreWorkflowError && !NOT_REFUSALS.has(error.code as string)) ||
    (error instanceof DocumentError && !NOT_REFUSALS.has(error.code)) ||
    error instanceof SpecificationError;

  return refused
    ? {
        code: (error as Error & { code: string }).code.slice(0, 100),
        message: refusalMessage(error),
        ...(error instanceof AttributionRefusalError ? { attribution: error.attribution } : {}),
      }
    : undefined;
}

function refusalMessage(error: unknown): string {
  const message = error instanceof Error && error.message ? error.message : 'Refused.';

  return message.slice(0, 4000);
}

/**
 * Finalize the agent attempt once a Turn of it ended and its process is proven stopped (D12): one
 * project control-lock section ({@link AgentAttemptDependencies.workflow}`.serialize`, taken once)
 * publishes the step state and then settles the Turn's execution claim, through lock-held forms that
 * never take the lock again; the post actions run only after the section released it.
 *
 * Inside the section, admitted under the `finalize` form of the Turn's own claim (A1: any unsettled
 * phase, `unknown` included, and only here):
 *
 * 1. the step state: the owner's recorded return request ends the attempt `returned` (A2), else the
 *    pending proposal is re-validated with exactly its recorded actor and input and published as the
 *    attempt's finish (a re-validation refusal publishes nothing and is recorded on the proposal);
 * 2. the attempt's journal: the outcome, the Turn's settlement time and dirty set, and the pending
 *    post actions (A6);
 * 3. the claim settlement with the native-result receipt.
 *
 * The store change is always published before the claim settles; they are two durable publications,
 * and while the claim is unsettled no other writer is admitted. Running the same finalize again (a
 * restart, a reconcile with the same native-stop evidence) is the recovery: a published finish
 * replays (same request digest, nothing applied twice), a recorded journal is not written again, the
 * settlement repeats idempotently, and pending post actions resume.
 */
export async function finalizeAgentAttempt(
  dependencies: AgentAttemptDependencies,
  request: FinalizeAgentAttemptInput,
): Promise<FinalizeAgentAttemptResult> {
  const { workflow } = dependencies;
  const operation = workflow.operation ?? ((work) => work());

  return operation(async () => {
    const outcome = await workflow.serialize(() => finalizeInSection(dependencies, request));
    await dependencies.finalize.faults?.('post-actions-pending');
    const postActions = await runAgentPostActions(dependencies, request.attemptId);

    return outcome.kind === 'finished' ? { ...outcome, postActions } : outcome;
  });
}

async function finalizeInSection(
  dependencies: AgentAttemptDependencies,
  request: FinalizeAgentAttemptInput,
): Promise<SectionOutcome> {
  const { intent, receipt } = request;
  const { finalize } = dependencies;
  const journal = await dependencies.journal.read(request.attemptId);
  if (!journal) {
    mismatch('No agent attempt has this id.');
  }

  const index = journal.turns.findIndex((turn) => turn.invocationId === intent.operationId);
  if (index < 0) {
    mismatch('The execution claim is not one of a Turn of this agent attempt.');
  }

  const owned: OwnedExecutionClaim = { operationId: intent.operationId, form: 'finalize' };
  await dependencies.admission(owned).admitWrite();
  // Only a claim whose Turn was dispatched has a native result to settle with: refused before the
  // step state is published, so nothing is published that the settlement would then refuse.
  const claim = await finalize.claim(intent.operationId);
  const phase = claim?.phase;
  if (phase === undefined) {
    throw new WorkspaceExecutionError(
      'EXECUTION_RECOVERY_REQUIRED',
      'Execution admission is missing.',
    );
  }

  if (phase === 'admitted') {
    throw new WorkspaceExecutionError(
      'EXECUTION_CONFLICT',
      'Undispatched execution cannot have a native result.',
    );
  }

  if (
    phase === 'settled' &&
    !isDeepStrictEqual(claim?.settlement, { kind: 'native-result', receipt })
  ) {
    throw new WorkspaceExecutionError(
      'EXECUTION_CONFLICT',
      'Settled execution receipt cannot change.',
    );
  }

  // Only the attempt's current Turn can still be unsettled: a Turn is bound once the one before it
  // settled. An earlier Turn's finalize is a replay; it publishes nothing.
  const turn = journal.turns[index]!;
  const current = index === journal.turns.length - 1 && turn.finalizedAt === undefined;
  let next = journal;
  let outcome: SectionOutcome = recordedOutcome(journal);
  if (current) {
    await assertNoOpenTurnWrites(dependencies, intent.operationId);
    ({ journal: next, outcome } = await publishStep(dependencies, journal, owned));
    next = await withTurnSettled(dependencies, next, turn);
  }

  if (!isDeepStrictEqual(next, journal)) {
    await dependencies.journal.publish(next);
  }

  await finalize.faults?.('attempt-recorded');
  await finalize.settleClaim(intent, receipt, {
    workspaceId: journal.workspaceId,
    specId: journal.subject.specId,
  });
  await finalize.faults?.('claim-settled');

  return outcome;
}

/**
 * A document write of the Turn that is still writing (a broker write that outlived the Turn's
 * capability) refuses the finalize before anything is published: the claim stays held and the same
 * finalize, run once that write finished or was recovered, publishes the complete step and dirty set.
 */
async function assertNoOpenTurnWrites(
  dependencies: AgentAttemptDependencies,
  invocationId: string,
): Promise<void> {
  const open = await dependencies.finalize.openWrites(invocationId);
  if (open.length > 0) {
    throw new SpecificationBusyError(
      `A document change of this agent Turn is still being written (${open.join(', ')}); ` +
        'the Turn is finalized once it has finished or was recovered.',
      { cause: 'write-in-progress' },
    );
  }
}

/** What an earlier finalize recorded for the attempt. */
function recordedOutcome(journal: AgentAttemptJournal): SectionOutcome {
  if (journal.returnRequest?.state === 'applied') {
    return { kind: 'returned' };
  }

  if (journal.proposal?.state === 'finalized') {
    return { kind: 'finished', transition: journal.proposal.transition };
  }

  if (journal.returnRequest?.state === 'refused' && journal.returnRequest.refusal) {
    return { kind: 'refused', of: 'return', refusal: journal.returnRequest.refusal };
  }

  if (journal.proposal?.state === 'refused' && journal.proposal.refusal) {
    return { kind: 'refused', of: 'proposal', refusal: journal.proposal.refusal };
  }

  return { kind: 'turn-ended' };
}

/** The ended Turn's settlement time and the checkout's dirty set now (data for the next Turn). */
async function withTurnSettled(
  dependencies: AgentAttemptDependencies,
  journal: AgentAttemptJournal,
  turn: AgentTurnBinding,
): Promise<AgentAttemptJournal> {
  const at = isoNow(dependencies.workflow);
  const facts = await dependencies.finalize.dirtySet(journal.workspaceId);
  const turns = journal.turns.map((entry) =>
    entry.invocationId === turn.invocationId ? { ...entry, finalizedAt: at } : entry,
  );

  return {
    ...journal,
    turns,
    ...(facts !== undefined
      ? {
          dirtySet: {
            invocationId: turn.invocationId,
            recordedAt: at,
            paths: facts.paths,
            ...(facts.truncated ? { truncated: true as const } : {}),
          },
        }
      : {}),
  };
}

interface PublishedStep {
  readonly journal: AgentAttemptJournal;
  readonly outcome: SectionOutcome;
}

/** Step 1 of the section: the store change of the attempt's outcome, if it has one to publish. */
async function publishStep(
  dependencies: AgentAttemptDependencies,
  journal: AgentAttemptJournal,
  owned: OwnedExecutionClaim,
): Promise<PublishedStep> {
  const store = dependencies.finalize.store(owned);
  const snapshot = await store.read(journal.subject.specId);
  const returnRequest = journal.returnRequest;
  if (returnRequest?.state === 'requested') {
    return publishReturn(dependencies, store, snapshot, journal);
  }

  const proposal = journal.proposal;
  if (proposal?.state !== 'pending') {
    // Nothing new to publish: a finalized attempt replays, any other Turn ended without a proposal.
    return {
      journal,
      outcome: proposal?.state === 'finalized' ? recordedOutcome(journal) : { kind: 'turn-ended' },
    };
  }

  // A pending proposal is always the current Turn's: an earlier Turn's was finalized at its end.
  if (proposal.invocationId !== owned.operationId) {
    corrupt('A pending agent proposal belongs to an earlier Turn of the attempt.');
  }

  const { workflow } = dependencies;
  try {
    const plan = await planFinish(
      workflow,
      snapshot,
      {
        subject: journal.subject,
        step: journal.step,
        attempt: journal.attempt,
        input: proposal.input,
        actor: proposal.actor,
      },
      { agentProposal: true },
    );
    // The checkout as the ended Turn left it must still be attributable as declared (B3, B6). A
    // replay was judged before its publication, which is final: it is never refused afterwards.
    if (plan.kind !== 'replayed') {
      await assertAgentFinishAttribution(dependencies, journal.workspaceId, proposal.changes);
    }

    // A replay publishes the pending store journal a crash left, if any (as a repeated finish does).
    await store.apply(journal.subject.specId, plan.kind === 'replayed' ? {} : plan.change);
    await dependencies.finalize.faults?.('step-published');

    return {
      journal: {
        ...journal,
        proposal: { ...proposal, state: 'finalized' },
        postActions: [
          {
            kind: 'step-finished',
            operationId: agentPostActionId(journal.operationId, 'step-finished'),
            stepTitle: plan.stepTitle,
            state: 'pending',
          },
        ],
      },
      outcome: { kind: 'finished', transition: plan.result.transition, finish: plan.result },
    };
  } catch (error) {
    const refusal = refusalOf(error);
    if (!refusal) {
      throw error;
    }

    return {
      journal: { ...journal, proposal: { ...proposal, state: 'refused', refusal } },
      outcome: { kind: 'refused', of: 'proposal', refusal },
    };
  }
}

/** The journal with its pending proposal, if any, refused because the owner's return was judged. */
function withoutPendingProposal(journal: AgentAttemptJournal): AgentAttemptJournal {
  return journal.proposal?.state === 'pending'
    ? {
        ...journal,
        proposal: { ...journal.proposal, state: 'refused', refusal: RETURN_REQUESTED_REFUSAL },
      }
    : journal;
}

/**
 * The owner's return request (A2), applied now that the Turn is proven stopped: the attempt ends
 * `returned`. An attempt that already ended `returned` is a replay (a crash after this publication).
 */
async function publishReturn(
  dependencies: AgentAttemptDependencies,
  store: WorkflowStore,
  snapshot: ExecutionSnapshot,
  journal: AgentAttemptJournal,
): Promise<PublishedStep> {
  const request = journal.returnRequest!;
  const { workflow } = dependencies;
  const record = loadSubject(workflow.catalogue, snapshot, journal.subject).run.attempts.find(
    (attempt) => agentAttemptBindingOf(attempt)?.attemptId === journal.operationId,
  );
  if (record?.step !== journal.step || record.attempt !== journal.attempt) {
    corrupt('The run has no attempt of this agent attempt journal.');
  }

  const applied: AgentAttemptJournal = {
    ...withoutPendingProposal(journal),
    returnRequest: { ...request, state: 'applied' },
  };
  if (record.outcome?.kind === 'returned') {
    await store.apply(journal.subject.specId, {});

    return { journal: applied, outcome: { kind: 'returned' } };
  }

  try {
    if (record.outcome !== undefined) {
      mismatch(`The attempt ${journal.step}#${String(journal.attempt)} has ended already.`);
    }

    const plan = planReturn(workflow, snapshot, {
      subject: journal.subject,
      step: request.step,
      ...(request.feedback !== undefined ? { feedback: request.feedback } : {}),
      actor: request.actor,
    });
    await store.apply(journal.subject.specId, plan.change);
    await dependencies.finalize.faults?.('step-published');

    return { journal: applied, outcome: { kind: 'returned', position: plan.result.position } };
  } catch (error) {
    const refusal = refusalOf(error);
    if (!refusal) {
      throw error;
    }

    return {
      journal: {
        ...withoutPendingProposal(journal),
        returnRequest: { ...request, state: 'refused', refusal },
      },
      outcome: { kind: 'refused', of: 'return', refusal },
    };
  }
}
