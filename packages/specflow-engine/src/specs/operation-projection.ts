import type { CreatedSpecification } from './durable-create';
import type { CloseJournal, CloseOutcome, ClosePlan, CloseKind } from './lifecycle/model';

export interface PublicCreateOperation {
  readonly operationId: string;
  readonly specId: string;
  readonly kind: 'specification-create';
  readonly status: 'completed';
  readonly slug: string;
  readonly workspaceId: string;
  readonly relativeManifestPath: string;
}

export type PublicCloseStatus =
  'completed' | 'in-progress' | 'requires-resolution' | 'recovery-required';

export interface PublicCloseOperation {
  readonly operationId: string;
  readonly specId: string;
  readonly kind: CloseKind;
  readonly status: PublicCloseStatus;
  readonly outcome?: CloseOutcome;
  readonly conflictPaths?: string[];
  readonly scratchRetired?: true;
}

export interface PublicClosePreview {
  readonly operationId: string;
  readonly specId: string;
  readonly kind: CloseKind;
  readonly location: 'active' | 'archive';
  readonly integrationRequired: boolean;
}

/** Transport-independent result. Never serialize workstation paths or journal evidence. */
export function projectCreatedSpecification(created: CreatedSpecification): PublicCreateOperation {
  return {
    operationId: created.operationId,
    specId: created.specId,
    kind: 'specification-create',
    status: 'completed',
    slug: created.slug,
    workspaceId: created.workspaceId,
    relativeManifestPath: created.relativeManifestPath,
  };
}

/** Nonterminal uncertain-effects remain fenced, never reported as successful. */
export function projectCloseOperation(journal: CloseJournal): PublicCloseOperation {
  const stage = journal.stage;
  const status: PublicCloseStatus =
    stage === 'completed'
      ? 'completed'
      : stage === 'archived-linked-awaiting-integration' || stage === 'integration-scratch-conflict'
        ? 'requires-resolution'
        : stage === 'recovery-required' ||
            stage === 'archive-initiated' ||
            stage === 'archive-commit-initiated' ||
            stage === 'integration-scratch-initiated' ||
            stage === 'integration-publish-initiated' ||
            stage === 'disposal-initiated'
          ? 'recovery-required'
          : 'in-progress';
  return {
    operationId: journal.plan.operationId,
    specId: journal.plan.specId,
    kind: journal.plan.kind,
    status,
    ...(journal.outcome !== undefined ? { outcome: journal.outcome } : {}),
    ...(status === 'requires-resolution' && journal.scratch?.conflictPaths
      ? { conflictPaths: [...journal.scratch.conflictPaths] }
      : {}),
    ...(journal.scratchRetired === true ? { scratchRetired: true as const } : {}),
  };
}

export function projectClosePreview(plan: ClosePlan): PublicClosePreview {
  return {
    operationId: plan.operationId,
    specId: plan.specId,
    kind: plan.kind,
    location: plan.location,
    integrationRequired: plan.kind === 'worktree-close' || plan.integrateToTargetBranch === true,
  };
}
