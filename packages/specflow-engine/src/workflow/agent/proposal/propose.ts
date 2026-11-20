import { isDeepStrictEqual } from 'node:util';

import { activeAttempt } from '@nevo/workflow';

import { WorkflowError } from '../../errors';
import { finishDigest } from '../../operations/actors';
import { planFinish, type FinishStepInput } from '../../operations/finish';
import { isoNow, loadSubject } from '../../operations/loaded-execution';
import { agentAttemptBindingOf, type AgentActor, type WorkflowSubject } from '../../state/model';
import type { AgentAttemptDependencies } from '../dependencies';
import { sameAttempt, type AgentAttemptJournal, type AgentFinishProposal } from '../journal/model';

/**
 * Who submits a proposal: the binding of the running Turn, built by the trusted Runtime from the
 * invocation (never from the agent's input).
 */
export interface AgentTurnIdentity {
  readonly attemptId: string;
  readonly invocationId: string;
  readonly actor: AgentActor;
  readonly subject: WorkflowSubject;
  readonly step: string;
  readonly attempt: number;
}

export interface ProposeAgentFinishInput {
  readonly turn: AgentTurnIdentity;
  /** The agent's finish input: result, feedback, artifacts and, for a producing step, its drafts. */
  readonly input: FinishStepInput['input'];
}

export interface ProposeAgentFinishResult {
  /**
   * `recorded`: the attempt's first proposal; `replaced`: it replaced a different proposal that was
   * not finalized; `replayed`: the same proposal again, the recorded one is returned unchanged.
   */
  readonly kind: 'recorded' | 'replaced' | 'replayed';
  readonly proposal: AgentFinishProposal;
}

function mismatch(message: string): never {
  throw new WorkflowError('WORKFLOW_ATTEMPT_MISMATCH', message);
}

/**
 * Record the agent's finish proposal for its own attempt (D12). The input is validated completely at
 * submission with the rules of an owner's finish (`planFinish`: legal transition, feedback, exit
 * gates, open Tasks, draft conflicts) and with what only the owner decides (D17,
 * `WORKFLOW_OWNER_DECISION_REQUIRED`); a refusal throws its reasons to the agent and records nothing.
 * The proposal is not a transition: nothing in the execution store changes until it is finalized.
 *
 * Deduplicated by the finish digest: the same proposal again returns the recorded one; a different
 * one replaces it while it is not finalized. Only the attempt's current Turn submits, while its
 * execution claim is dispatched (the `turn` admission): a call of a stopped or replaced invocation is
 * refused.
 */
export function proposeAgentFinish(
  dependencies: AgentAttemptDependencies,
  request: ProposeAgentFinishInput,
): Promise<ProposeAgentFinishResult> {
  const { turn, input } = request;
  const { workflow } = dependencies;

  return workflow.serialize(async () => {
    await dependencies.admission({ operationId: turn.invocationId, form: 'turn' }).admitWrite();
    const journal = await dependencies.journal.read(turn.attemptId);
    assertCurrentTurn(journal, turn);
    const requestDigest = finishDigest({ step: turn.step, attempt: turn.attempt, input });
    const recorded = journal.proposal;
    if (
      recorded?.requestDigest === requestDigest &&
      isDeepStrictEqual(recorded.actor, turn.actor)
    ) {
      return { kind: 'replayed', proposal: recorded };
    }

    if (recorded?.state === 'finalized') {
      mismatch(
        `The attempt ${turn.step}#${String(turn.attempt)} was finalized with another proposal.`,
      );
    }

    const snapshot = await workflow.store.read(turn.subject.specId);
    const run = loadSubject(workflow.catalogue, snapshot, turn.subject).run;
    const position = run.position;
    if (
      position.state !== 'active' ||
      position.step !== turn.step ||
      position.attempt !== turn.attempt ||
      agentAttemptBindingOf(activeAttempt(run))?.attemptId !== turn.attemptId
    ) {
      mismatch(`The attempt ${turn.step}#${String(turn.attempt)} is not active any more.`);
    }

    const plan = await planFinish(
      workflow,
      snapshot,
      { subject: turn.subject, step: turn.step, attempt: turn.attempt, input, actor: turn.actor },
      { agentProposal: true },
    );
    if (plan.kind !== 'planned') {
      throw new WorkflowError('WORKFLOW_STATE_CORRUPT', 'An active attempt replayed a finish.');
    }

    const proposal: AgentFinishProposal = {
      requestDigest,
      invocationId: turn.invocationId,
      actor: turn.actor,
      input,
      transition: plan.transition,
      submittedAt: isoNow(workflow),
      state: 'pending',
    };
    await dependencies.journal.publish({ ...journal, proposal });

    return { kind: recorded ? 'replaced' : 'recorded', proposal };
  });
}

/** The journal is the attempt's, and the Turn submitting is its current one. */
function assertCurrentTurn(
  journal: AgentAttemptJournal | undefined,
  turn: AgentTurnIdentity,
): asserts journal is AgentAttemptJournal {
  if (!journal || !sameAttempt(journal, turn.subject, turn.step, turn.attempt)) {
    mismatch(`No Turn is bound to the attempt ${turn.step}#${String(turn.attempt)}.`);
  }

  if (journal.turns.at(-1)?.invocationId !== turn.invocationId) {
    mismatch('This Turn of the attempt was stopped or replaced; it cannot submit a proposal.');
  }
}

/** The attempt's local journal (its Turns and its proposal), lock-free; `undefined` when none. */
export function readAgentAttempt(
  dependencies: Pick<AgentAttemptDependencies, 'journal'>,
  attemptId: string,
): Promise<AgentAttemptJournal | undefined> {
  return dependencies.journal.read(attemptId);
}
