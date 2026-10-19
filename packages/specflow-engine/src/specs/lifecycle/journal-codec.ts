import { join } from 'node:path';

import type { ResolvedProjectHome } from '../../project/project-home';
import { fingerprintCloseIntent, resourcesForClosePlan, type CloseJournal } from './model';

export const CLOSE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SHA = /^[a-f0-9]{64}$/iu;

export function isCloseJournal(
  context: ResolvedProjectHome,
  value: unknown,
  operationId: string,
): value is CloseJournal {
  if (!isRecord(value) || !isRecord(value.plan)) return false;
  const plan = value.plan;
  // Only durable shape and stage/evidence coherence are checked here.
  // Physical Git, registry and checkout proofs belong to lifecycle operations.
  if (value.reason !== undefined) return false;
  const retainedConflict = value.stage === 'archived-linked-awaiting-integration';
  if (value.scratchRetired !== undefined && (!retainedConflict || value.scratchRetired !== true))
    return false;
  if (
    retainedConflict &&
    (value.outcome !== 'archived-linked-awaiting-integration' ||
      plan.kind !== 'specification-close')
  )
    return false;
  const archiveOnlyCompleted =
    value.stage === 'completed' &&
    plan.kind === 'specification-close' &&
    isRecord(plan.source) &&
    (plan.source.instanceId === undefined || plan.integrateToTargetBranch === false);
  const afterRebind =
    value.stage === 'binding-rebound' ||
    value.stage === 'disposal-initiated' ||
    (value.stage === 'completed' && !archiveOnlyCompleted);
  if (afterRebind) {
    const linkedSpecification =
      plan.kind === 'specification-close' &&
      isRecord(plan.source) &&
      typeof plan.source.instanceId === 'string' &&
      plan.integrateToTargetBranch === true;
    if (
      (plan.kind !== 'worktree-close' && !linkedSpecification) ||
      typeof value.reboundRevision !== 'number' ||
      !Number.isSafeInteger(value.reboundRevision) ||
      typeof plan.registryRevision !== 'number' ||
      value.reboundRevision !== plan.registryRevision + 1 ||
      (value.stage === 'completed'
        ? value.outcome !==
          (linkedSpecification ? 'integrated-and-removed' : 'worktree-integrated-and-removed')
        : value.outcome !== undefined)
    )
      return false;
  } else if (archiveOnlyCompleted) {
    const expected =
      isRecord(plan.source) && plan.source.instanceId !== undefined
        ? 'archive-only-closed'
        : 'archived-in-primary';
    if (value.outcome !== expected || value.reboundRevision !== undefined) return false;
  } else if (
    !retainedConflict &&
    (value.outcome !== undefined || value.reboundRevision !== undefined)
  ) {
    return false;
  }
  if (value.stage === 'reserved') {
    if (
      value.integration !== undefined ||
      value.scratch !== undefined ||
      value.archive !== undefined
    )
      return false;
  } else if (
    value.stage === 'archive-initiated' ||
    value.stage === 'archive-commit-initiated' ||
    value.stage === 'archive-committed' ||
    archiveOnlyCompleted
  ) {
    if (value.integration !== undefined || value.scratch !== undefined) return false;
    if (
      !isArchiveEvidence(
        value.archive,
        plan,
        archiveOnlyCompleted ? 'archive-committed' : String(value.stage),
      )
    )
      return false;
  } else if (
    value.stage === 'integration-preparation-initiated' ||
    value.stage === 'integration-scratch-initiated' ||
    value.stage === 'integration-scratch-candidate' ||
    value.stage === 'integration-scratch-conflict' ||
    value.stage === 'integration-publish-initiated' ||
    value.stage === 'integration-verified' ||
    retainedConflict ||
    afterRebind
  ) {
    if (plan.kind === 'specification-close' && value.archive === undefined) return false;
    if (value.archive !== undefined && !isArchiveEvidence(value.archive, plan, 'archive-committed'))
      return false;
    if (retainedConflict && (value.archive === undefined || value.reboundRevision !== undefined))
      return false;
    if (!isIntegrationPreparation(value.integration, plan, String(value.stage), value.archive))
      return false;
    if (!isIntegrationScratch(context, operationId, value.scratch, String(value.stage)))
      return false;
    if (
      (value.stage === 'integration-publish-initiated' ||
        value.stage === 'integration-verified' ||
        afterRebind) &&
      isRecord(value.integration) &&
      (value.integration.relationship === 'divergent') !== isRecord(value.scratch)
    )
      return false;
    if (
      (value.stage === 'integration-verified' || afterRebind) &&
      isRecord(value.integration) &&
      value.integration.relationship === 'divergent' &&
      isRecord(value.scratch) &&
      value.integration.publishedCommit !== value.scratch.candidateCommit
    )
      return false;
  } else {
    return false;
  }
  if (
    value.version !== 1 ||
    value.projectId !== context.project.projectId ||
    value.gitInstanceId !== context.project.gitInstanceId ||
    plan.operationId !== operationId ||
    !CLOSE_UUID.test(operationId) ||
    (plan.kind !== 'worktree-close' && plan.kind !== 'specification-close') ||
    typeof plan.specId !== 'string' ||
    !CLOSE_UUID.test(plan.specId) ||
    typeof plan.fingerprint !== 'string' ||
    !SHA.test(plan.fingerprint) ||
    typeof plan.slug !== 'string' ||
    (plan.location !== 'active' && plan.location !== 'archive') ||
    typeof plan.registryRevision !== 'number' ||
    !Number.isSafeInteger(plan.registryRevision) ||
    (plan.bindingGeneration !== undefined &&
      (typeof plan.bindingGeneration !== 'number' ||
        !Number.isSafeInteger(plan.bindingGeneration))) ||
    !isWorkspace(plan.source) ||
    (plan.target !== undefined && !isWorkspace(plan.target)) ||
    (plan.targetBranch !== undefined && typeof plan.targetBranch !== 'string') ||
    (plan.integrateToTargetBranch !== undefined &&
      typeof plan.integrateToTargetBranch !== 'boolean') ||
    (plan.configRevision !== undefined &&
      (typeof plan.configRevision !== 'string' || !SHA.test(plan.configRevision))) ||
    !Array.isArray(plan.resources)
  ) {
    return false;
  }

  if (!isCoherentCloseScope(plan)) return false;

  const resources: readonly unknown[] = plan.resources;
  if (
    resources.length === 0 ||
    !resources.every(
      (resource): resource is string => typeof resource === 'string' && resource.length > 0,
    )
  ) {
    return false;
  }
  const resourceNames: readonly string[] = resources;
  if (
    new Set(resourceNames).size !== resourceNames.length ||
    resourceNames.some((resource, index) => index > 0 && resourceNames[index - 1]! >= resource)
  ) {
    return false;
  }

  const intent =
    plan.kind === 'worktree-close'
      ? { kind: 'worktree-close' as const, operationId, specId: plan.specId }
      : {
          kind: 'specification-close' as const,
          operationId,
          specId: plan.specId,
          integrateToTargetBranch: plan.integrateToTargetBranch ?? false,
        };
  if (plan.fingerprint !== fingerprintCloseIntent(intent)) return false;
  // Reconstitute only the fields needed for derived ownership: the complete
  // journal is not trusted until all pinned identities/resources agree.
  const verifiedPlan = plan as unknown as CloseJournal['plan'];
  return (
    resourceNames.join('\0') ===
    resourcesForClosePlan(verifiedPlan, context.project.projectId).join('\0')
  );
}

/**
 * Reject journals that claim integration but omit the destination checkout:
 * accepting them would allow resource under-reservation on a shared Git ref.
 * For archive-only linked Specs, the destination must not be pinned at all.
 */
function isCoherentCloseScope(plan: Record<string, unknown>): boolean {
  if (!isRecord(plan.source)) return false;
  const linked = plan.source.instanceId !== undefined;
  if (plan.kind === 'worktree-close') {
    if (!linked || plan.integrateToTargetBranch !== undefined) return false;
  } else if (plan.kind === 'specification-close') {
    if ((typeof plan.integrateToTargetBranch === 'boolean') !== linked) return false;
    if (plan.location !== 'active') return false;
  }
  const integrate = plan.kind === 'worktree-close' || plan.integrateToTargetBranch === true;
  const needsTarget = integrate || !linked;
  if (!needsTarget) {
    return (
      plan.target === undefined &&
      plan.targetBranch === undefined &&
      plan.configRevision === undefined
    );
  }
  if (!isRecord(plan.target) || !isWorkspace(plan.target)) return false;
  return (
    typeof plan.targetBranch === 'string' &&
    plan.targetBranch === plan.target.branch &&
    typeof plan.configRevision === 'string' &&
    SHA.test(plan.configRevision) &&
    (linked
      ? plan.source.workspaceId !== plan.target.workspaceId
      : plan.source.workspaceId === plan.target.workspaceId)
  );
}

function isArchiveEvidence(value: unknown, plan: Record<string, unknown>, stage: string): boolean {
  if (
    plan.kind !== 'specification-close' ||
    plan.location !== 'active' ||
    !isRecord(plan.source) ||
    !isRecord(value) ||
    typeof value.sourceCommit !== 'string' ||
    value.sourceCommit !== plan.source.head ||
    typeof plan.slug !== 'string' ||
    value.sourcePath !== 'specs/active/' + plan.slug ||
    value.destinationPath !== 'specs/archive/' + plan.slug ||
    typeof value.archivedManifestSha256 !== 'string' ||
    !SHA.test(value.archivedManifestSha256) ||
    typeof value.sourcePath !== 'string' ||
    typeof value.destinationPath !== 'string' ||
    !Array.isArray(value.files) ||
    value.files.length === 0 ||
    value.files.length > 4096
  )
    return false;
  const files: readonly unknown[] = value.files;
  const sourcePath = String(value.sourcePath);
  const manifestPath = sourcePath + '/specification.yaml';
  const valid = files.every((file, index) => {
    if (
      !isRecord(file) ||
      typeof file.relativePath !== 'string' ||
      !file.relativePath.startsWith(sourcePath + '/') ||
      file.relativePath.includes('\\') ||
      file.relativePath.split('/').some((part) => !part || part === '.' || part === '..') ||
      typeof file.sha256 !== 'string' ||
      !SHA.test(file.sha256)
    )
      return false;
    const previous = index === 0 ? undefined : files[index - 1];
    return (
      index === 0 ||
      (isRecord(previous) &&
        typeof previous.relativePath === 'string' &&
        previous.relativePath < file.relativePath)
    );
  });
  if (!valid) return false;
  if (!files.some((file) => isRecord(file) && file.relativePath === manifestPath)) {
    return false;
  }
  const id = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/iu;
  if (stage === 'archive-committed')
    return (
      typeof value.committedHead === 'string' &&
      id.test(value.committedHead) &&
      typeof value.committedTree === 'string' &&
      id.test(value.committedTree)
    );
  return value.committedHead === undefined && value.committedTree === undefined;
}

function isIntegrationPreparation(
  value: unknown,
  plan: Record<string, unknown>,
  stage: string,
  archive?: unknown,
): boolean {
  // Linked Worktree closure may integrate the originally pinned source HEAD.
  // Linked Specification closure must first commit archive effects and pin
  // its NEW integrationSourceCommit. T11 deliberately cannot skip that step.
  if (
    (plan.kind !== 'worktree-close' && plan.kind !== 'specification-close') ||
    !isRecord(plan.source) ||
    !isRecord(plan.target)
  )
    return false;
  if (
    plan.kind === 'specification-close' &&
    (!isRecord(archive) ||
      typeof archive.committedHead !== 'string' ||
      archive.sourceCommit !== plan.source.head)
  )
    return false;
  if (plan.kind === 'worktree-close' && archive !== undefined) return false;
  if (!isRecord(value)) return false;
  const sha = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/iu;
  const published = value.publishedCommit;
  if (stage === 'integration-preparation-initiated') {
    if (published !== undefined) return false;
  } else if (
    stage === 'integration-scratch-initiated' ||
    stage === 'integration-scratch-candidate' ||
    stage === 'integration-scratch-conflict' ||
    stage === 'archived-linked-awaiting-integration'
  ) {
    if (value.relationship !== 'divergent' || published !== undefined) return false;
  } else if (stage === 'integration-publish-initiated') {
    if (value.relationship === 'already-integrated' || published !== undefined) return false;
  } else if (
    stage === 'integration-verified' ||
    stage === 'binding-rebound' ||
    stage === 'disposal-initiated' ||
    stage === 'completed'
  ) {
    if (
      value.relationship !== 'divergent' &&
      published !==
        (value.relationship === 'fast-forward' ? value.sourceCommit : value.targetCommit)
    )
      return false;
    if (
      value.relationship === 'divergent' &&
      (typeof published !== 'string' || !sha.test(published))
    ) {
      return false;
    }
  } else {
    return false;
  }
  return (
    typeof value.sourceCommit === 'string' &&
    sha.test(value.sourceCommit) &&
    value.sourceCommit ===
      (plan.kind === 'worktree-close'
        ? plan.source.head
        : isRecord(archive)
          ? archive.committedHead
          : undefined) &&
    typeof value.targetCommit === 'string' &&
    sha.test(value.targetCommit) &&
    value.targetCommit === plan.target.head &&
    typeof value.mergeBaseCommit === 'string' &&
    sha.test(value.mergeBaseCommit) &&
    typeof value.sourceTree === 'string' &&
    sha.test(value.sourceTree) &&
    typeof value.targetTree === 'string' &&
    sha.test(value.targetTree) &&
    (value.relationship === 'already-integrated' ||
      value.relationship === 'fast-forward' ||
      value.relationship === 'divergent')
  );
}

function isIntegrationScratch(
  context: ResolvedProjectHome,
  operationId: string,
  value: unknown,
  stage: string,
): boolean {
  const scratchStage =
    stage === 'integration-scratch-initiated' ||
    stage === 'integration-scratch-candidate' ||
    stage === 'integration-scratch-conflict' ||
    stage === 'archived-linked-awaiting-integration' ||
    (stage === 'integration-publish-initiated' && isRecord(value)) ||
    ((stage === 'integration-verified' ||
      stage === 'binding-rebound' ||
      stage === 'disposal-initiated' ||
      stage === 'completed') &&
      isRecord(value));
  if (!scratchStage) return value === undefined;
  if (!isRecord(value)) return false;
  if (
    value.root !== join(context.project.stateRoot, 'engine', 'integration-scratch', operationId) ||
    typeof value.instanceId !== 'string' ||
    !CLOSE_UUID.test(value.instanceId)
  ) {
    return false;
  }
  const objectId = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/iu;
  if (stage === 'integration-scratch-initiated') {
    return (
      value.candidateCommit === undefined &&
      value.candidateTree === undefined &&
      value.conflictPaths === undefined &&
      value.conflictIndexHash === undefined
    );
  }
  if (
    stage === 'integration-scratch-candidate' ||
    stage === 'integration-publish-initiated' ||
    stage === 'integration-verified' ||
    stage === 'binding-rebound' ||
    stage === 'disposal-initiated' ||
    stage === 'completed'
  ) {
    return (
      typeof value.candidateCommit === 'string' &&
      objectId.test(value.candidateCommit) &&
      typeof value.candidateTree === 'string' &&
      objectId.test(value.candidateTree) &&
      value.conflictPaths === undefined &&
      value.conflictIndexHash === undefined
    );
  }
  if (stage !== 'integration-scratch-conflict' && stage !== 'archived-linked-awaiting-integration')
    return false;
  if (
    value.candidateCommit !== undefined ||
    value.candidateTree !== undefined ||
    !Array.isArray(value.conflictPaths) ||
    value.conflictPaths.length === 0 ||
    typeof value.conflictIndexHash !== 'string' ||
    !SHA.test(value.conflictIndexHash)
  ) {
    return false;
  }
  const paths: readonly unknown[] = value.conflictPaths;
  return paths.every(
    (path, index) =>
      typeof path === 'string' &&
      path.length > 0 &&
      !path.includes('\0') &&
      (index === 0 || (typeof paths[index - 1] === 'string' && String(paths[index - 1]) < path)),
  );
}

function isWorkspace(value: unknown): boolean {
  return (
    isRecord(value) &&
    CLOSE_UUID.test(value.workspaceId as string) &&
    typeof value.root === 'string' &&
    typeof value.branch === 'string' &&
    /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/iu.test(value.head as string) &&
    (value.instanceId === undefined || CLOSE_UUID.test(value.instanceId as string))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
