import { activeAttempt } from '@nevo/workflow';

import { WorkflowError } from '../../errors';
import { loadSubject } from '../../operations/loaded-execution';
import { planReturn } from '../../operations/return';
import type { ExecutionSnapshot } from '../../state/store';
import { agentAttemptBindingOf } from '../../state/model';
import type { AgentAttemptDependencies } from '../dependencies';
import { agentRefusalOf } from '../finalize/finalize';
import {
  isAttemptJournalSettled,
  isAttemptResolved,
  type AgentAttemptJournal,
} from '../journal/model';
import { currentTurnClaim, isUnsettled } from './claim';

/**
 * What the owner's actions leave on an agent attempt journal when the step state moved without the
 * Turn's finalize, applied in a control-lock section the caller holds:
 *
 * - a return `requested` while the Turn's claim was only admitted, whose claim was then abandoned as
 *   never dispatched (the abandon path runs no finalize): the return applies now, as the owner's
 *   write, or is recorded refused;
 * - a Take over whose run change landed but whose journal record did not (a crash between them): the
 *   journal records it from the run.
 *
 * Returns the journal as it is now (published, and settled once nothing of it is left).
 */
export async function settleOwnerOutcome(
  dependencies: AgentAttemptDependencies,
  journal: AgentAttemptJournal,
  snapshot: ExecutionSnapshot,
): Promise<AgentAttemptJournal> {
  const { workflow } = dependencies;
  const run = loadSubject(workflow.catalogue, snapshot, journal.subject).run;
  const index = run.attempts.findIndex(
    (attempt) => agentAttemptBindingOf(attempt)?.attemptId === journal.operationId,
  );
  const record = run.attempts[index];
  if (!record) {
    return journal;
  }

  if (record.outcome?.kind === 'taken-over' && journal.takeOver === undefined) {
    const next = run.attempts[index + 1];
    if (next?.step === record.step && next.actor?.class === 'human') {
      return publish(dependencies, {
        ...journal,
        takeOver: {
          actor: next.actor,
          at: record.endedAt ?? next.startedAt,
          attempt: next.attempt,
        },
      });
    }

    return journal;
  }

  const request = journal.returnRequest;
  if (request?.state !== 'requested' || record.outcome !== undefined) {
    return journal;
  }

  const claim = await currentTurnClaim(dependencies, journal);
  if (isUnsettled(claim.phase) || claim.phase === undefined) {
    return journal;
  }

  // The claim settled, and no finalize applied the request (it was abandoned before dispatch).
  try {
    const plan = planReturn(workflow, snapshot, {
      subject: journal.subject,
      step: request.step,
      ...(request.feedback !== undefined ? { feedback: request.feedback } : {}),
      actor: request.actor,
    });
    await workflow.store.apply(journal.subject.specId, plan.change);

    return await publish(dependencies, {
      ...journal,
      returnRequest: { ...request, state: 'applied' },
    });
  } catch (error) {
    const refusal = agentRefusalOf(error);
    if (!refusal) {
      throw error;
    }

    return publish(dependencies, {
      ...journal,
      returnRequest: { ...request, state: 'refused', refusal },
    });
  }
}

/**
 * {@link settleOwnerOutcome} of one attempt in its own control-lock section: what the Runtime runs
 * once a Turn's claim was abandoned as never dispatched. Nothing to do: a no-op.
 */
export function settleAbandonedAgentTurn(
  dependencies: AgentAttemptDependencies,
  attemptId: string,
): Promise<void> {
  return dependencies.workflow.serialize(async () => {
    const journal = await dependencies.journal.read(attemptId);
    if (journal && !isAttemptResolved(journal)) {
      const snapshot = await dependencies.workflow.store.read(journal.subject.specId);
      await settleOwnerOutcome(dependencies, journal, snapshot);
    }
  });
}

/**
 * The admission of an agent attempt Turn's execution claim (Major gap of D19), judged inside the
 * claim admission's control-lock section: the attempt is still the active attempt of its run, it did
 * not end, the owner did not return it, and the Turn is its last one. A Take over or Return that
 * landed after the Turn was bound and before its claim refuses the Turn here, before any process
 * exists (`WORKFLOW_ATTEMPT_MISMATCH`). Lock-free reads only: the caller holds the lock.
 */
export async function assertAgentTurnAdmissible(
  dependencies: Pick<AgentAttemptDependencies, 'journal' | 'workflow'>,
  attemptId: string,
  invocationId: string,
): Promise<void> {
  const journal = await dependencies.journal.read(attemptId);
  const refuse = (why: string): never => {
    throw new WorkflowError('WORKFLOW_ATTEMPT_MISMATCH', why);
  };

  if (!journal || isAttemptResolved(journal)) {
    return refuse('The agent attempt has ended; this Turn cannot start.');
  }

  const returned = journal.returnRequest?.state;
  if (returned === 'requested' || returned === 'applied') {
    refuse('The owner returned the step during this agent attempt; this Turn cannot start.');
  }

  if (journal.turns.at(-1)?.invocationId !== invocationId) {
    refuse('This Turn is not the current Turn of its agent attempt.');
  }

  const snapshot = await dependencies.workflow.store.read(journal.subject.specId);
  const active = activeAttempt(
    loadSubject(dependencies.workflow.catalogue, snapshot, journal.subject).run,
  );
  if (agentAttemptBindingOf(active)?.attemptId !== attemptId) {
    refuse('The agent attempt is not the active attempt any more; this Turn cannot start.');
  }
}

async function publish(
  dependencies: AgentAttemptDependencies,
  journal: AgentAttemptJournal,
): Promise<AgentAttemptJournal> {
  await dependencies.journal.publish(journal);
  if (isAttemptJournalSettled(journal)) {
    await dependencies.journal.settle(journal.operationId);
  }

  return journal;
}
