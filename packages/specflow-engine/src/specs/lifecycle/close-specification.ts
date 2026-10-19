import { isDeepStrictEqual } from 'node:util';

import type { SpecFlowEngine } from '../../application';
import { publishCloseCheckpoint } from './close-checkpoint';
import { readWorkspaceRegistry } from '../../project/workspace-registry';
import { readWorkspaceSpecification } from '../repository';
import { archiveSpecificationWithCommit, inspectArchivePhysicalRecovery } from './archive-effects';
import { prepareCloseGitIntegration } from './git-preparation';
import { settleArchivedLinkedConflict } from './git-scratch';
import { readCloseJournal } from './journal-store';
import { CloseOperationError, type CloseJournal } from './model';
import { reserveCloseOperation } from './reservation';
import { advanceCloseIntegration } from './close-integration';

export type CloseSpecificationResult =
  | { readonly status: 'completed'; readonly journal: CloseJournal }
  | {
      readonly status: 'requires-resolution';
      readonly journal: CloseJournal;
      readonly conflictPaths: readonly string[];
    };

function recovery(message: string): CloseOperationError {
  return new CloseOperationError('CLOSE_RECOVERY_REQUIRED', message);
}

function needsIntegration(journal: CloseJournal): boolean {
  return (
    journal.plan.source.instanceId !== undefined && journal.plan.integrateToTargetBranch === true
  );
}

/** Canonical archive is physically owned by source until a proven CAS rebind. */
async function assertArchivedAt(root: string, specId: string): Promise<void> {
  const specification = await readWorkspaceSpecification(root, specId);
  if (specification.location !== 'archive' || specification.status !== 'archived')
    throw recovery('Canonical archived Specification is not physically present.');
}

async function settleArchiveWithoutIntegration(
  engine: SpecFlowEngine,
  journal: CloseJournal,
): Promise<CloseJournal> {
  if (
    journal.stage !== 'archive-committed' ||
    !journal.archive?.committedHead ||
    needsIntegration(journal)
  )
    throw recovery('Archive cannot be settled without commit proof.');
  if (
    (await inspectArchivePhysicalRecovery(engine, journal.plan.operationId)) !==
    'committed-and-verified'
  )
    throw recovery('Archive commit is not physically verified.');
  const registry = await readWorkspaceRegistry(engine.context);
  const binding = registry.specBindings.find((x) => x.specId === journal.plan.specId);
  if (
    registry.revision !== journal.plan.registryRevision ||
    (journal.plan.source.instanceId !== undefined &&
      (binding?.workspaceId !== journal.plan.source.workspaceId ||
        binding.generation !== journal.plan.bindingGeneration))
  )
    throw recovery('Canonical binding changed before archive-only settlement.');
  await assertArchivedAt(journal.plan.source.root, journal.plan.specId);
  const next: CloseJournal = {
    ...journal,
    stage: 'completed',
    outcome: journal.plan.source.instanceId ? 'archive-only-closed' : 'archived-in-primary',
  };
  return publishCloseCheckpoint(engine, journal, next, {
    onConflict: 'Archive settlement lost its pinned journal or registry.',
    onConflictCode: 'CLOSE_RECOVERY_REQUIRED',
    onReadbackFailure: 'Archive settlement was not durable.',
    verifyCurrent: async () => {
      const latest = await readWorkspaceRegistry(engine.context);
      if (latest.revision !== journal.plan.registryRevision)
        throw recovery('Archive settlement lost its pinned journal or registry.');
    },
  });
}

/**
 * E2.T15: Engine owns the scoped archive commit and the optional linked
 * integration. Uncertain Git/archive effects are never automatically retried.
 */
export async function closeSpecification(
  engine: SpecFlowEngine,
  request: {
    readonly operationId: string;
    readonly specId: string;
    readonly integrateToTargetBranch?: boolean;
  },
): Promise<CloseSpecificationResult> {
  const admission = await reserveCloseOperation(engine, {
    kind: 'specification-close',
    ...request,
  });
  let journal = admission.journal;
  if (journal.stage === 'reserved') {
    // TODO(specification-exit): connect real Specification exit gates/actions owned by future workflow slice here.
    journal = await archiveSpecificationWithCommit(engine, request.operationId);
  }
  if (journal.stage === 'archive-committed') {
    journal = needsIntegration(journal)
      ? await prepareCloseGitIntegration(engine, request.operationId)
      : await settleArchiveWithoutIntegration(engine, journal);
  }
  journal = await advanceCloseIntegration(engine, journal);
  if (journal.stage === 'integration-scratch-conflict')
    journal = await settleArchivedLinkedConflict(engine, request.operationId);
  if (journal.stage === 'archived-linked-awaiting-integration') {
    if (
      (await inspectArchivePhysicalRecovery(engine, request.operationId)) !==
      'committed-and-verified'
    )
      throw recovery('Retained archive commit is not verified.');
    const registry = await readWorkspaceRegistry(engine.context);
    const binding = registry.specBindings.find((x) => x.specId === request.specId);
    if (
      registry.revision !== journal.plan.registryRevision ||
      binding?.workspaceId !== journal.plan.source.workspaceId ||
      binding.generation !== journal.plan.bindingGeneration
    )
      throw recovery('Retained source binding changed without reconciliation.');
    await assertArchivedAt(journal.plan.source.root, request.specId);
    return {
      status: 'requires-resolution',
      journal,
      conflictPaths: journal.scratch?.conflictPaths ?? [],
    };
  }

  if (journal.stage !== 'completed' || !journal.archive?.committedHead)
    throw recovery('Close is nonterminal; inspect its exact physical effects before recovery.');
  const final = await readCloseJournal(engine.context, request.operationId);
  const registry = await readWorkspaceRegistry(engine.context);
  if (!final || !isDeepStrictEqual(final, journal))
    throw recovery('Completion journal changed during final verification.');
  if (needsIntegration(journal)) {
    const target = journal.plan.target;
    const binding = registry.specBindings.find((x) => x.specId === request.specId);
    if (
      !target ||
      binding?.workspaceId !== target.workspaceId ||
      registry.workspaces.some((x) => x.workspaceId === journal.plan.source.workspaceId)
    )
      throw recovery('Integrated binding or linked workspace retirement is not proven.');
    await assertArchivedAt(target.root, request.specId);
  } else {
    if (
      (await inspectArchivePhysicalRecovery(engine, request.operationId)) !==
      'committed-and-verified'
    )
      throw recovery('Completed archive commit is not verified.');
    await assertArchivedAt(journal.plan.source.root, request.specId);
    if (journal.plan.source.instanceId) {
      const binding = registry.specBindings.find((x) => x.specId === request.specId);
      if (
        binding?.workspaceId !== journal.plan.source.workspaceId ||
        binding.generation !== journal.plan.bindingGeneration
      )
        throw recovery('Archive-only close changed the canonical linked binding.');
    }
  }
  return { status: 'completed', journal: final };
}
