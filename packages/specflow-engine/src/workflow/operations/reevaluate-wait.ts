import { findStep } from '@nevo/workflow';

import { WorkflowError } from '../errors';
import type { OwnerActor, WorkflowSubject } from '../state/model';
import { assertOwner } from './actors';
import { settleWait, waitCompletionTransition, waitRecoveryBlockers } from './advance';
import { isoNow, loadSubject, type WorkflowDependencies } from './loaded-execution';
import { ExecutionWorkingSet } from './working-set';

export interface ReevaluateWaitInput {
  readonly specId: string;
  readonly step: string;
  readonly attempt: number;
  readonly actor: OwnerActor;
}

export interface ReevaluateWaitResult {
  readonly step: string;
  readonly attempt: number;
  readonly status: 'settled' | 'already-settled';
}

/** Deliver a missed Task completion event to one specific Specification wait attempt. */
export function reevaluateWait(
  dependencies: WorkflowDependencies,
  { specId, step, attempt, actor }: ReevaluateWaitInput,
): Promise<ReevaluateWaitResult> {
  return dependencies.serialize(async () => {
    assertOwner(actor, 're-evaluates a wait step');
    const subject: WorkflowSubject = { kind: 'specification', specId };
    const catalogue = (await dependencies.reloadCatalogue?.()) ?? dependencies.catalogue;
    const snapshot = await dependencies.store.read(specId);
    const { definition, run } = loadSubject(catalogue, snapshot, subject);
    const record = run.attempts.find((entry) => entry.step === step && entry.attempt === attempt);
    const transition = waitCompletionTransition(definition, step);
    if (
      transition &&
      record?.outcome?.kind === 'transition' &&
      record.outcome.transition === transition.id
    ) {
      // The read can see a committed journal before publication finishes.
      await dependencies.store.apply(specId, {});

      return { step, attempt, status: 'already-settled' };
    }

    const position = run.position;
    if (
      !record ||
      position.state !== 'active' ||
      position.step !== step ||
      position.attempt !== attempt
    ) {
      throw new WorkflowError(
        'WORKFLOW_ATTEMPT_MISMATCH',
        'This wait attempt is no longer active.',
      );
    }

    if (findStep(definition, step)?.kind !== 'wait') {
      throw new WorkflowError('WORKFLOW_POSITION_INVALID', 'The active step is not a wait step.');
    }

    if (!transition) {
      throw new WorkflowError(
        'WORKFLOW_STATE_CORRUPT',
        'The wait step has no tasks-finished transition.',
      );
    }

    const requireClosedTasks = (set: ExecutionWorkingSet) => {
      const blockers = waitRecoveryBlockers(set.tasks(), set.brokenTasks());
      if (blockers.length > 0) {
        throw new WorkflowError(
          'WORKFLOW_TASK_BLOCKED',
          `Resolve these Tasks before ending the wait: ${blockers.join(', ')}.`,
        );
      }
    };
    const set = new ExecutionWorkingSet(snapshot, catalogue);
    requireClosedTasks(set);
    settleWait({ set, catalogue, at: isoNow(dependencies) });
    await dependencies.store.apply(specId, {
      ...set.change(),
      verifySnapshot: (current) => requireClosedTasks(new ExecutionWorkingSet(current, catalogue)),
      summary: `settle wait ${step}`,
    });

    return { step, attempt, status: 'settled' };
  });
}
