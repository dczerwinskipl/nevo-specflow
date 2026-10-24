import type { CreatedSpecification } from '../create';
import type { CloseJournal, CloseOutcome, ClosePlan, CloseKind } from '../lifecycle';

export interface PublicCreateOperation {
  readonly operationId: string;
  readonly specId: string;
  readonly kind: 'specification-create';
  readonly status: 'completed';
  readonly slug: string;
  readonly workspaceId: string;
  readonly relativeManifestPath: string;
  readonly documentIds: string[];
}

export type PublicCloseStatus =
  'completed' | 'in-progress' | 'requires-resolution' | 'recovery-required';

export interface PublicCloseOperation {
  readonly operationId: string;
  readonly specId: string;
  readonly kind: Exclude<CloseKind, 'workspace-close'>;
  readonly status: PublicCloseStatus;
  readonly outcome?: CloseOutcome;
  readonly conflictPaths?: string[];
  readonly scratchRetired?: true;
}

export interface PublicClosePreview {
  readonly operationId: string;
  readonly specId: string;
  readonly kind: Exclude<CloseKind, 'workspace-close'>;
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
    documentIds: [...created.documentIds],
  };
}

/** Nonterminal uncertain-effects remain fenced, never reported as successful. */
function projectCloseJournalState(
  journal: CloseJournal,
): Omit<PublicCloseOperation, 'operationId' | 'specId' | 'kind'> {
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
    status,
    ...(journal.outcome !== undefined ? { outcome: journal.outcome } : {}),
    ...(status === 'requires-resolution' && journal.scratch?.conflictPaths
      ? { conflictPaths: [...journal.scratch.conflictPaths] }
      : {}),
    ...(journal.scratchRetired === true ? { scratchRetired: true as const } : {}),
  };
}

export function projectCloseOperation(journal: CloseJournal): PublicCloseOperation {
  if (journal.plan.kind === 'workspace-close')
    throw new Error('Workspace Close must use the workspace-specific projection.');
  return {
    operationId: journal.plan.operationId,
    specId: journal.plan.specId,
    kind: journal.plan.kind,
    ...projectCloseJournalState(journal),
  };
}

export function projectClosePreview(plan: ClosePlan): PublicClosePreview {
  if (plan.kind === 'workspace-close')
    throw new Error('Workspace Close must use the workspace-specific preview.');
  return {
    operationId: plan.operationId,
    specId: plan.specId,
    kind: plan.kind,
    location: plan.location,
    integrationRequired: plan.kind === 'worktree-close' || plan.integrateToTargetBranch === true,
  };
}

/** Workspace-scoped transport DTO never exposes the legacy internal spec anchor. */
export interface PublicWorkspaceClosePreview {
  readonly operationId: string;
  readonly workspaceId: string;
  readonly kind: 'workspace-close';
  readonly sourceBranch: string;
  readonly targetWorkspaceId: string;
  readonly targetBranch: string;
  readonly wholeBranchIntegration: true;
  readonly occupantCount: number;
  readonly occupants: {
    specId: string;
    slug: string;
    location: 'active' | 'archive';
    status: string;
  }[];
}

export interface PublicWorkspaceCloseOperation {
  readonly operationId: string;
  readonly workspaceId: string;
  readonly kind: 'workspace-close';
  readonly status: PublicCloseStatus;
  readonly outcome?: 'worktree-integrated-and-removed';
  readonly conflictPaths?: string[];
  readonly occupantCount: number;
}

export function projectWorkspaceClosePreview(plan: ClosePlan): PublicWorkspaceClosePreview {
  if (
    plan.kind !== 'workspace-close' ||
    !plan.workspaceId ||
    !plan.occupants ||
    !plan.target ||
    !plan.targetBranch
  )
    throw new Error('Expected complete workspace Close preview.');
  return {
    operationId: plan.operationId,
    workspaceId: plan.workspaceId,
    kind: 'workspace-close',
    sourceBranch: plan.source.branch,
    targetWorkspaceId: plan.target.workspaceId,
    targetBranch: plan.targetBranch,
    wholeBranchIntegration: true,
    occupantCount: plan.occupants.length,
    occupants: plan.occupants.map(({ specId, slug, location, status }) => ({
      specId,
      slug,
      location,
      status,
    })),
  };
}

export function projectWorkspaceCloseOperation(
  journal: CloseJournal,
): PublicWorkspaceCloseOperation {
  if (
    journal.plan.kind !== 'workspace-close' ||
    !journal.plan.workspaceId ||
    !journal.plan.occupants
  )
    throw new Error('Expected workspace Close journal.');
  if (journal.outcome !== undefined && journal.outcome !== 'worktree-integrated-and-removed')
    throw new Error('Unexpected Workspace Close outcome.');
  const projected = projectCloseJournalState(journal);
  return {
    operationId: journal.plan.operationId,
    workspaceId: journal.plan.workspaceId,
    kind: 'workspace-close',
    status: projected.status,
    ...(journal.outcome !== undefined ? { outcome: journal.outcome } : {}),
    ...(projected.conflictPaths ? { conflictPaths: projected.conflictPaths } : {}),
    occupantCount: journal.plan.occupants.length,
  };
}
