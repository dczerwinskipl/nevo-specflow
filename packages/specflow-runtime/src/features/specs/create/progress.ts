import { createStepForStage, type CreateStageObservation } from '@nevo/specflow-engine';
import {
  specificationCreateSteps,
  type SpecificationCreateStep,
} from '@nevo/specflow-contracts/operations';

import type { OperationProgressRegistry } from '../../operations';

/** Journal failure codes that mean "an operator must repair this", not "the request failed". */
const RECOVERY_CODES: ReadonlySet<string> = new Set([
  'CREATE_RECOVERY_REQUIRED',
  'CREATE_JOURNAL_CORRUPT',
  'REGISTRY_RECOVERY_REQUIRED',
  'GIT_OPERATION_UNCERTAIN',
  'COMMIT_FAILED',
]);

export interface CreateProgress {
  /** Feed Engine stage transitions (`createSpecificationFromRequest` option `onStage`). */
  onStage(observation: CreateStageObservation): void;
  complete(result: unknown): void;
  /** `code` is the Engine's typed public code, or undefined for an unexpected failure. */
  fail(code: string | undefined): void;
}

/**
 * The one adapter between the Create journal and the generic progress registry: raw journal
 * stages are mapped onto the stable public step vocabulary and never leave this module.
 */
export function startCreateProgress(
  registry: OperationProgressRegistry,
  operationId: string,
  target: 'existing' | 'new-worktree',
  /** The Engine commits the scaffold (`git.enabled`): the checklist gets `committing-specification`. */
  commits = false,
): CreateProgress {
  const steps = specificationCreateSteps(target, commits);
  const reporter = registry.begin({ operationId, kind: 'specification-create', steps });

  const enter = (step: SpecificationCreateStep) => {
    for (const earlier of steps) {
      if (earlier === step) break;
      reporter.step(earlier, 'done');
    }
    reporter.step(step, 'running');
  };
  enter('reserving');

  return {
    onStage({ stage }) {
      // Completion is published with its typed result by complete().
      if (stage === 'completed') return;
      if (stage === 'recovery-required') {
        reporter.recoveryRequired();
        return;
      }
      // The same stage -> step mapping the journal listing uses; an unknown stage moves nothing.
      const step = createStepForStage(stage, target, commits);
      if (step && steps.includes(step)) enter(step);
    },
    complete: (result) => reporter.complete(result),
    fail(code) {
      if (code !== undefined && RECOVERY_CODES.has(code)) reporter.recoveryRequired();
      else reporter.fail(code ?? 'INTERNAL_ERROR');
    },
  };
}
