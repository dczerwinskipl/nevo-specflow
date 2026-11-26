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
  'CREATE_JOURNAL_UNSUPPORTED',
  'REGISTRY_RECOVERY_REQUIRED',
  'GIT_OPERATION_UNCERTAIN',
  'COMMIT_FAILED',
]);

/** The Create failed in a way only an operator repairs: its outcome is not a refusal. */
export function isRecoveryCode(code: string): boolean {
  return RECOVERY_CODES.has(code);
}

export interface CreateProgress {
  /** Feed Engine stage transitions (`createSpecificationFromRequest` option `onStage`). */
  onStage(observation: CreateStageObservation): void;
  /** The Specification is registered and the Runtime starts the first-step agent. */
  startingAgent(): void;
  /** The first-step agent did not start: its row is skipped (the result says why). */
  agentNotStarted(): void;
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
  /** The Create carries a first-step intent: the checklist ends with `starting-agent`. */
  firstStep = false,
): CreateProgress {
  const steps = specificationCreateSteps(target, commits, firstStep);
  const reporter = registry.begin({ operationId, kind: 'specification-create', steps });

  const enter = (step: SpecificationCreateStep) => {
    for (const earlier of steps) {
      if (earlier === step) {
        break;
      }

      reporter.step(earlier, 'done');
    }

    reporter.step(step, 'running');
  };

  enter('reserving');

  return {
    onStage({ stage }) {
      // Completion is published with its typed result by complete().
      if (stage === 'completed') {
        return;
      }

      if (stage === 'recovery-required') {
        reporter.recoveryRequired();

        return;
      }

      // The same stage -> step mapping the journal listing uses; an unknown stage moves nothing.
      const step = createStepForStage(stage, target, commits);
      if (step && steps.includes(step)) {
        enter(step);
      }
    },
    startingAgent() {
      if (steps.includes('starting-agent')) {
        enter('starting-agent');
      }
    },
    agentNotStarted() {
      if (steps.includes('starting-agent')) {
        reporter.step('starting-agent', 'skipped');
      }
    },
    complete: (result) => reporter.complete(result),
    fail(code) {
      if (code !== undefined && RECOVERY_CODES.has(code)) {
        reporter.recoveryRequired();
      } else {
        reporter.fail(code ?? 'INTERNAL_ERROR');
      }
    },
  };
}
