import { activeAttempt } from '@nevo/workflow';

import { assertOwner } from '../../operations/actors';
import { isoNow, loadSubject } from '../../operations/loaded-execution';
import {
  planReturn,
  type ReturnToStepInput,
  type ReturnToStepResult,
} from '../../operations/return';
import { agentAttemptBindingOf, type WorkflowSubject } from '../../state/model';
import type { AgentAttemptDependencies } from '../dependencies';
import {
  isAttemptJournalSettled,
  type AgentAttemptJournal,
  type AgentReturnRequest,
} from '../journal/model';
import { admitUnderOwnTurn, currentTurnClaim, isUnsettled } from './claim';

/**
 * What the owner's Return did:
 *
 * - `returned`: the run moved back now (no agent attempt was active, or its Turn's claim was
 *   settled);
 * - `return-requested`: an agent attempt's Turn may still run (its claim is unsettled, D19): the
 *   return is recorded on the attempt and applied by its finalize once the Turn is proven stopped.
 *   The caller stops the Turn (`sessionId`, `turnId`); the step stays where it is until then.
 */
export type OwnerReturnResult =
  | ({ readonly kind: 'returned' } & ReturnToStepResult)
  | {
      readonly kind: 'return-requested';
      readonly subject: WorkflowSubject;
      /** The return target. */
      readonly to: string;
      readonly attemptId: string;
      readonly step: string;
      readonly attempt: number;
      readonly sessionId: string;
      readonly turnId: string;
      readonly requestedAt: string;
    };

/**
 * The owner's Return of a subject (A2). Every rule of the return is judged now, on the current
 * state, so a return the finalize would refuse is refused at once. Then:
 *
 * - no agent attempt is active, or its last Turn's claim is settled (or was never admitted): the
 *   return applies now, as `returnToStep` does; an agent attempt it ends records the return as
 *   applied in its journal;
 * - the agent's Turn may still run: the return is recorded on the attempt (`returnRequest`,
 *   `requested`), admitted under that Turn's own claim only; the step state is not written. A
 *   repeated request replaces the recorded one while it is not applied.
 */
export function returnDuringAgentAttempt(
  dependencies: AgentAttemptDependencies,
  request: ReturnToStepInput,
): Promise<OwnerReturnResult> {
  const { workflow } = dependencies;

  return workflow.serialize(async () => {
    assertOwner(request.actor, 'returns a run to an earlier step');
    const snapshot = await workflow.store.read(request.subject.specId);
    const plan = planReturn(workflow, snapshot, request);
    const active = activeAttempt(loadSubject(workflow.catalogue, snapshot, request.subject).run);
    const binding = agentAttemptBindingOf(active);
    const journal = binding ? await dependencies.journal.read(binding.attemptId) : undefined;
    const claim = journal ? await currentTurnClaim(dependencies, journal) : undefined;
    const at = isoNow(workflow);
    const returnRequest = (state: AgentReturnRequest['state']): AgentReturnRequest => ({
      step: request.step,
      ...(request.feedback !== undefined ? { feedback: request.feedback } : {}),
      actor: request.actor,
      requestedAt: at,
      state,
    });

    if (!journal || !claim || !isUnsettled(claim.phase)) {
      await workflow.store.apply(request.subject.specId, plan.change);
      if (journal) {
        await recordApplied(dependencies, { ...journal, returnRequest: returnRequest('applied') });
      }

      return { kind: 'returned', ...plan.result };
    }

    await admitUnderOwnTurn(dependencies, claim.turn.invocationId);
    await dependencies.journal.publish({ ...journal, returnRequest: returnRequest('requested') });

    return {
      kind: 'return-requested',
      subject: request.subject,
      to: request.step,
      attemptId: journal.operationId,
      step: journal.step,
      attempt: journal.attempt,
      sessionId: journal.actor.details.sessionId ?? '',
      turnId: claim.turn.turnId,
      requestedAt: at,
    };
  });
}

/** The journal of an attempt the return ended now: recorded, then settled (nothing is left). */
async function recordApplied(
  dependencies: AgentAttemptDependencies,
  journal: AgentAttemptJournal,
): Promise<void> {
  await dependencies.journal.publish(journal);
  if (isAttemptJournalSettled(journal)) {
    await dependencies.journal.settle(journal.operationId);
  }
}
