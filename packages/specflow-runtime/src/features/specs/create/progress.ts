import type { CreateStageObservation } from '@nevo/specflow-engine';
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
      switch (stage) {
        case 'reserved':
          enter('reserving');
          break;
        case 'git-initiated':
        case 'git-provisioned':
          // Existing targets have no workspace step; their identity check belongs to reserving.
          enter(steps.includes('preparing-workspace') ? 'preparing-workspace' : 'reserving');
          break;
        case 'manifest-writing':
        case 'manifest-written':
          enter('writing-specification');
          break;
        case 'commit-writing':
        case 'commit-written':
          // Only journals that carry a commit reach these stages, i.e. `commits` is true.
          enter(
            steps.includes('committing-specification')
              ? 'committing-specification'
              : 'writing-specification',
          );
          break;
        case 'registry-writing':
        case 'registry-linked':
          enter('registering');
          break;
        case 'completed':
          // Completion is published with its typed result by complete().
          break;
        case 'recovery-required':
          reporter.recoveryRequired();
          break;
        default: {
          const exhaustive: never = stage;
          return exhaustive;
        }
      }
    },
    complete: (result) => reporter.complete(result),
    fail(code) {
      if (code !== undefined && RECOVERY_CODES.has(code)) reporter.recoveryRequired();
      else reporter.fail(code ?? 'INTERNAL_ERROR');
    },
  };
}
