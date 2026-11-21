import { ANY_TASK_TYPE } from '@nevo/specflow-contracts/documents';
import { activeAttempt, decide, findStep } from '@nevo/workflow';

import { SpecificationBusyError, WorkflowError } from '../../errors';
import { assertOwner } from '../../operations/actors';
import { executionTasks, isoNow, loadSubject, ofSubject } from '../../operations/loaded-execution';
import { compileStepContext, type StepContext } from '../../operations/step-context';
import { ExecutionWorkingSet } from '../../operations/working-set';
import { agentAttemptBindingOf, type OwnerActor, type WorkflowSubject } from '../../state/model';
import type { AgentAttemptDependencies } from '../dependencies';
import { isAttemptJournalSettled, type AgentAttemptJournal } from '../journal/model';
import { currentTurnClaim, isUnsettled } from './claim';

export interface TakeOverAgentAttemptInput {
  readonly subject: WorkflowSubject;
  /** The agent attempt the owner was shown; a stale one is `WORKFLOW_ATTEMPT_MISMATCH`. */
  readonly step: string;
  readonly attempt: number;
  /** The owner, from trusted Runtime/CLI context; taking over is an owner action. */
  readonly actor: OwnerActor;
}

export interface TakeOverAgentAttemptResult {
  readonly subject: WorkflowSubject;
  /** The agent attempt that ended `taken-over`. */
  readonly takenOver: {
    readonly attemptId: string;
    readonly step: string;
    readonly attempt: number;
  };
  /** The owner's attempt that started, with what it works from. */
  readonly context: StepContext;
}

function mismatch(message: string): never {
  throw new WorkflowError('WORKFLOW_ATTEMPT_MISMATCH', message);
}

/**
 * Take over (F17, D19): the owner ends the active agent attempt `step#attempt` as `taken-over` and
 * starts their own attempt of the same step in the same change, with the same handoff. Allowed only
 * once the agent's last Turn is proven ended (its claim settled, or never admitted): while it may
 * still run, `WORKFLOW_SPECIFICATION_BUSY` naming it (stop it first). Nothing the agent wrote is
 * undone or committed: its documents, Task drafts and changed files stay as they are, and Close
 * lists what is uncommitted until the owner commits it. A late proposal of the attempt is refused
 * (`WORKFLOW_ATTEMPT_MISMATCH`).
 */
export function takeOverAgentAttempt(
  dependencies: AgentAttemptDependencies,
  input: TakeOverAgentAttemptInput,
): Promise<TakeOverAgentAttemptResult> {
  const { workflow } = dependencies;

  return workflow.serialize(async () => {
    assertOwner(input.actor, 'takes over an agent attempt');
    const { subject } = input;
    const snapshot = await workflow.store.read(subject.specId);
    const loaded = loadSubject(workflow.catalogue, snapshot, subject);
    const active = activeAttempt(loaded.run);
    if (active?.step !== input.step || active.attempt !== input.attempt) {
      mismatch(
        `${input.step}#${String(input.attempt)} is not the active attempt${ofSubject(subject)} any more.`,
      );
    }

    const binding = agentAttemptBindingOf(active);
    if (!binding) {
      mismatch(
        `${input.step}#${String(input.attempt)} is not an agent attempt; it has no agent to take over from.`,
      );
    }

    const journal = await dependencies.journal.read(binding.attemptId);
    if (journal) {
      await assertTurnEnded(dependencies, journal);
    }

    const at = isoNow(workflow);
    const decision = decide(loaded.definition, loaded.run, {
      kind: 'take-over',
      at,
      step: input.step,
      attempt: input.attempt,
      actor: input.actor,
    });
    const set = new ExecutionWorkingSet(snapshot, workflow.catalogue);
    set.setRun(subject, decision.nextRun);
    const intent = decision.intent;
    const step = findStep(loaded.definition, input.step);
    if (intent.kind !== 'execute' || step?.kind !== 'work') {
      throw new WorkflowError('WORKFLOW_STATE_CORRUPT', 'A take-over activated no work step.');
    }

    await workflow.store.apply(subject.specId, {
      ...set.change(),
      summary: `take over step ${input.step}${ofSubject(subject)} (attempt ${String(input.attempt)} → ${String(intent.attempt)})`,
    });
    if (journal) {
      const ended: AgentAttemptJournal = {
        ...journal,
        takeOver: { actor: input.actor, at, attempt: intent.attempt },
      };
      await dependencies.journal.publish(ended);
      if (isAttemptJournalSettled(ended)) {
        await dependencies.journal.settle(ended.operationId);
      }
    }

    return {
      subject,
      takenOver: { attemptId: binding.attemptId, step: input.step, attempt: input.attempt },
      context: compileStepContext({
        subject,
        run: decision.nextRun,
        definition: loaded.definition,
        step,
        attempt: intent.attempt,
        catalogue: workflow.catalogue,
        ...(loaded.task ? { task: loaded.task } : {}),
        allowedTaskTypes: snapshot.specification?.value.taskTypes ?? [ANY_TASK_TYPE],
        ...executionTasks(workflow.catalogue, snapshot),
      }),
    };
  });
}

/** The agent's last Turn is proven ended, and no return of the attempt is waiting to apply. */
async function assertTurnEnded(
  dependencies: AgentAttemptDependencies,
  journal: AgentAttemptJournal,
): Promise<void> {
  const { turn, phase } = await currentTurnClaim(dependencies, journal);
  const sessionId = journal.actor.details.sessionId ?? '';
  if (isUnsettled(phase)) {
    throw new SpecificationBusyError(
      phase === 'unknown'
        ? "SpecFlow cannot tell whether the agent's process is still running; check its outcome before taking over."
        : 'The agent is still working on this attempt; stop it and wait until it has stopped before taking over.',
      { cause: phase === 'unknown' ? 'agent-turn-unknown' : 'agent-turn', sessionId },
      { operationId: turn.invocationId, sessionId },
    );
  }

  if (journal.returnRequest?.state === 'requested') {
    throw new WorkflowError(
      'WORKFLOW_POSITION_INVALID',
      'A return of this attempt is waiting to apply; it cannot be taken over.',
    );
  }
}
