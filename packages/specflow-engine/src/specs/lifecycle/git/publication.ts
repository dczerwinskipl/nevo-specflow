import type { SpecFlowEngine } from '../../../application';
import { GitCapabilityError } from '../../../git/errors';
import { publishCloseCheckpoint } from '../close/checkpoint';
import {
  inspectRegisteredWorkspace,
  readWorkspaceRegistry,
} from '../../../project/workspace/registry/registry';
import {
  inspectGitIntegrationEvidence,
  publishGitFastForward,
  verifyGitTreePathEquivalent,
  verifyPublishedGitCheckout,
} from '../../../version-control/git/integration';
import { readProjectGitPolicy } from '../../../version-control/worktrees/config';
import { readWorkspaceSpecification, listWorkspaceSpecifications } from '../../repository';
import { inspectCloseGitIntegration } from './integration';
import { disabledIntegrationHooksDirectory, requireRecordedDivergentCandidate } from './scratch';
import { readCloseJournal } from '../journal/store';
import { CloseOperationError, type CloseJournal } from '../model';
import { inspectCleanGitWorkspace } from '../preflight';

function conflict(message: string): CloseOperationError {
  return new CloseOperationError('CLOSE_CONFLICT', message);
}

function recovery(message: string): CloseOperationError {
  return new CloseOperationError('CLOSE_RECOVERY_REQUIRED', message);
}

/** Every canonical occupant must retain identical committed subtree bytes. */
async function verifyCloseSpecificationTrees(
  record: CloseJournal,
  sourceCommit: string,
  targetCommit: string,
): Promise<void> {
  const destination = record.plan.target;
  if (!destination) {
    throw recovery('Missing verified integration destination.');
  }

  const specs = record.plan.occupants ?? [
    {
      slug: record.plan.slug,
      location: record.archive ? ('archive' as const) : record.plan.location,
    },
  ];
  for (const spec of specs) {
    await verifyGitTreePathEquivalent(
      destination.root,
      sourceCommit,
      targetCommit,
      'specs/' + spec.location + '/' + spec.slug,
    );
  }
}

async function requireCurrentAdmission(
  engine: SpecFlowEngine,
  record: CloseJournal,
): Promise<void> {
  const registry = await readWorkspaceRegistry(engine.context);
  if (registry.revision !== record.plan.registryRevision) {
    throw conflict('Workspace registry changed after Close reservation.');
  }

  if (record.plan.configRevision) {
    const policy = await readProjectGitPolicy(engine.context);
    if (
      policy.revision !== record.plan.configRevision ||
      policy.policy.integrationTargetBranch !== record.plan.targetBranch
    ) {
      throw conflict('Pinned integration target policy changed.');
    }
  } else {
    const source = registry.workspaces.find(
      (item) => item.workspaceId === record.plan.source.workspaceId,
    );
    const pinned = source?.kind === 'linked' ? source.integrationDestination : undefined;
    if (
      !pinned ||
      pinned.workspaceId !== record.plan.target?.workspaceId ||
      pinned.instanceId !== record.plan.target.instanceId ||
      pinned.branch !== record.plan.targetBranch
    ) {
      throw conflict('Pinned integration destination changed.');
    }
  }
}

/** State transition under the short Project Home lock, without a Git subprocess. */
async function persistStage(
  engine: SpecFlowEngine,
  previous: CloseJournal,
  next: CloseJournal,
): Promise<CloseJournal> {
  return publishCloseCheckpoint(engine, previous, next, {
    onConflict: 'Close journal changed while proving Git publication.',
    onReadbackFailure: 'Unable to verify the durable Git publication checkpoint.',
    verifyCurrent: (current) => requireCurrentAdmission(engine, current),
  });
}

/**
 * Real Git publication, scoped to a verified Worktree Close fast-forward.
 * Never available through CLI/HTTP until T16's project-wide permission gate.
 * A journaled but uncertain effect remains owned and cannot be replayed.
 */
export async function publishCloseGitFastForward(
  engine: SpecFlowEngine,
  operationId: string,
  afterPersistedIntent?: () => Promise<void>,
  afterGitPublication?: () => Promise<void>,
): Promise<CloseJournal> {
  const record = await readCloseJournal(engine.context, operationId);
  if (record?.stage !== 'integration-preparation-initiated') {
    throw conflict('A fresh durable integration preparation is required.');
  }

  if (
    (record.plan.kind !== 'worktree-close' &&
      record.plan.kind !== 'workspace-close' &&
      (record.plan.kind !== 'specification-close' || !record.archive?.committedHead)) ||
    !record.integration ||
    !record.plan.target
  ) {
    throw conflict('Only Worktree Close may publish the pinned source HEAD before archive.');
  }

  if (record.integration.relationship !== 'fast-forward') {
    throw conflict('This Git publication requires a verified fast-forward history.');
  }

  const proof = await inspectCloseGitIntegration(engine, operationId);
  if (
    proof.relationship !== 'fast-forward' ||
    proof.sourceCommit !== record.integration.sourceCommit ||
    proof.targetCommit !== record.integration.targetCommit ||
    proof.sourceTree !== record.integration.sourceTree ||
    proof.targetTree !== record.integration.targetTree
  ) {
    throw conflict('Git input evidence changed after durable preparation.');
  }

  // Project-wide Git integration authority is a separate T16 permission.
  // Until present, never silently install changed Project Home policy.
  if (proof.changedPaths.includes('.nevo/config.yaml')) {
    throw new CloseOperationError(
      'CLOSE_PREFLIGHT',
      'Project Git configuration changed; separate integration authority is required.',
    );
  }

  const target = record.plan.target;
  const integration = record.integration;
  const disabledHooksDirectory = await disabledIntegrationHooksDirectory(engine);
  await persistStage(engine, record, {
    ...record,
    stage: 'integration-publish-initiated',
  });
  // Fault injection is Engine-test-only, never a transport option.
  await afterPersistedIntent?.();
  try {
    await publishGitFastForward({
      root: target.root,
      expectedTargetCommit: integration.targetCommit,
      expectedTargetBranch: target.branch,
      disabledHooksDirectory,
      sourceCommit: integration.sourceCommit,
    });
  } catch {
    // A failure or lost child process is NOT evidence of no side effects.
    throw recovery('Git publication may have changed HEAD/index/files; inspect before recovery.');
  }

  // Test-only crash point: Git has exited successfully but reconciliation
  // has NOT yet promoted the persisted publication intent.
  await afterGitPublication?.();

  // The mutating Git child exited and was observed by the Engine in this call.
  return reconcileCloseGitPublication(engine, operationId, true);
}

/**
 * Reconcile WITHOUT rerunning Git. The boolean is an internal trusted
 * operator/process quiescence assertion, not a public caller-supplied bypass.
 * Unknown or modified checkout state retains journal ownership for recovery.
 */
export async function reconcileCloseGitPublication(
  engine: SpecFlowEngine,
  operationId: string,
  confirmedNoActiveGitProcess: boolean,
): Promise<CloseJournal> {
  const journal = await readCloseJournal(engine.context, operationId);
  if (journal?.stage !== 'integration-publish-initiated') {
    throw conflict('No incomplete Git publication intent exists.');
  }

  if (!confirmedNoActiveGitProcess) {
    throw recovery('Git process quiescence must be positively established before reconciliation.');
  }

  const integration = journal.integration;
  const target = journal.plan.target;
  if (
    !integration ||
    !target ||
    (integration.relationship !== 'fast-forward' && integration.relationship !== 'divergent')
  ) {
    throw recovery('Git publication evidence is absent or unsupported.');
  }

  const divergent = integration.relationship === 'divergent';
  const candidate = divergent ? journal.scratch?.candidateCommit : integration.sourceCommit;
  const candidateTree = divergent ? journal.scratch?.candidateTree : integration.sourceTree;
  if (!candidate || !candidateTree) {
    throw recovery('Pinned Git publication commit or tree is missing.');
  }

  try {
    const registry = await engine.readRegistry();
    const sourceWorkspace = registry.workspaces.find(
      (item) => item.workspaceId === journal.plan.source.workspaceId,
    );
    const targetWorkspace = registry.workspaces.find(
      (item) => item.workspaceId === target.workspaceId,
    );
    if (!sourceWorkspace || !targetWorkspace) {
      throw conflict('Pinned workspace registration disappeared during publication.');
    }

    if (
      sourceWorkspace.root !== journal.plan.source.root ||
      sourceWorkspace.instanceId !== journal.plan.source.instanceId ||
      targetWorkspace.root !== target.root ||
      targetWorkspace.instanceId !== target.instanceId
    ) {
      throw conflict('Pinned workspace registration changed during Git publication.');
    }

    const source = await inspectRegisteredWorkspace(
      engine.context,
      registry,
      journal.plan.source.workspaceId,
    );
    const destination = await inspectRegisteredWorkspace(
      engine.context,
      registry,
      target.workspaceId,
    );
    if (source.status !== 'available' || destination.status !== 'available') {
      throw conflict('Pinned Git checkout became unavailable after publication.');
    }

    const sourceFacts = await inspectCleanGitWorkspace(sourceWorkspace);
    if (
      sourceFacts.head !== integration.sourceCommit ||
      sourceFacts.branch !== journal.plan.source.branch
    ) {
      throw conflict('Source commit or checkout identity changed during publication.');
    }

    if (divergent) {
      await requireRecordedDivergentCandidate(engine, journal);
    }

    await verifyPublishedGitCheckout({
      root: target.root,
      expectedBranch: target.branch,
      expectedCommit: candidate,
      expectedTree: candidateTree,
    });
    await verifyCloseSpecificationTrees(journal, integration.sourceCommit, candidate);
  } catch {
    throw recovery('Destination Git HEAD, index, physical tree or source identity is unproven.');
  }

  return persistStage(engine, journal, {
    ...journal,
    stage: 'integration-verified',
    integration: { ...integration, publishedCommit: candidate },
  });
}

/**
 * A target may already contain source history. This path performs NO Git
 * mutation, but it must prove the specific Specification subtree is unchanged.
 * Ancestry alone is not sufficient for a canonical binding handover.
 */
export async function proveAlreadyIntegratedClose(
  engine: SpecFlowEngine,
  operationId: string,
): Promise<CloseJournal> {
  const record = await readCloseJournal(engine.context, operationId);
  if (
    record?.stage !== 'integration-preparation-initiated' ||
    (record.plan.kind !== 'worktree-close' &&
      record.plan.kind !== 'workspace-close' &&
      (record.plan.kind !== 'specification-close' || !record.archive?.committedHead)) ||
    record.integration?.relationship !== 'already-integrated' ||
    !record.plan.target
  ) {
    throw conflict('A prepared, already-integrated Worktree Close is required.');
  }

  const proof = await inspectCloseGitIntegration(engine, operationId);
  const integration = record.integration;
  const target = record.plan.target;
  if (
    proof.relationship !== 'already-integrated' ||
    proof.sourceCommit !== integration.sourceCommit ||
    proof.targetCommit !== integration.targetCommit ||
    proof.targetTree !== integration.targetTree
  ) {
    throw conflict('Already-integrated ancestry changed after preparation.');
  }

  try {
    await verifyPublishedGitCheckout({
      root: target.root,
      expectedBranch: target.branch,
      expectedCommit: integration.targetCommit,
      expectedTree: integration.targetTree,
    });
    await verifyCloseSpecificationTrees(record, integration.sourceCommit, integration.targetCommit);
  } catch (error) {
    if (error instanceof GitCapabilityError) {
      throw conflict(error.message);
    }

    throw error;
  }

  return persistStage(engine, record, {
    ...record,
    stage: 'integration-verified',
    integration: { ...integration, publishedCommit: integration.targetCommit },
  });
}

/**
 * Mandatory fail-closed precondition for future rebind / disposal effects.
 * A structurally valid integration-verified journal is NOT an attestation
 * of physical Git state: independently recheck both real checkout identities,
 * pinned commits, target HEAD, index, worktree, and canonical Spec tree.
 * Call again immediately before each subsequent mutation; this read-only
 * proof cannot serialize arbitrary out-of-band Git processes.
 */
export async function requireVerifiedCloseIntegration(
  engine: SpecFlowEngine,
  operationId: string,
): Promise<CloseJournal> {
  const record = await readCloseJournal(engine.context, operationId);
  if (
    record?.stage !== 'integration-verified' ||
    (record.plan.kind !== 'worktree-close' &&
      record.plan.kind !== 'workspace-close' &&
      (record.plan.kind !== 'specification-close' || !record.archive?.committedHead)) ||
    !record.integration ||
    !record.plan.target
  ) {
    throw recovery('A verified Close integration is required before rebind or disposal.');
  }

  try {
    await requireCurrentAdmission(engine, record);
    const registry = await engine.readRegistry();
    if (registry.revision !== record.plan.registryRevision) {
      throw conflict('Workspace registry revision changed after Git integration.');
    }

    const targetPlan = record.plan.target;
    const integration = record.integration;
    const sourceRegistration = registry.workspaces.find(
      (workspace) => workspace.workspaceId === record.plan.source.workspaceId,
    );
    const targetRegistration = registry.workspaces.find(
      (workspace) => workspace.workspaceId === targetPlan.workspaceId,
    );
    if (
      !sourceRegistration ||
      !targetRegistration ||
      sourceRegistration.root !== record.plan.source.root ||
      sourceRegistration.instanceId !== record.plan.source.instanceId ||
      targetRegistration.root !== targetPlan.root ||
      targetRegistration.instanceId !== targetPlan.instanceId
    ) {
      throw conflict('Physical workspace registration changed after Git integration.');
    }

    const [source, target] = await Promise.all([
      inspectRegisteredWorkspace(engine.context, registry, sourceRegistration.workspaceId),
      inspectRegisteredWorkspace(engine.context, registry, targetRegistration.workspaceId),
    ]);
    if (source.status !== 'available' || target.status !== 'available') {
      throw conflict('Physical source or target checkout is unavailable.');
    }

    const sourceFacts = await inspectCleanGitWorkspace(sourceRegistration);
    const targetFacts = await inspectCleanGitWorkspace(targetRegistration);
    if (
      sourceFacts.head !== integration.sourceCommit ||
      sourceFacts.branch !== record.plan.source.branch ||
      targetFacts.branch !== targetPlan.branch ||
      targetFacts.head !== integration.publishedCommit
    ) {
      throw conflict('Pinned Git source or published target checkout has changed.');
    }

    const expectedCommit = integration.publishedCommit;
    if (!expectedCommit) {
      throw conflict('Published commit evidence is missing.');
    }

    const expectedTree =
      integration.relationship === 'fast-forward'
        ? integration.sourceTree
        : integration.relationship === 'divergent'
          ? record.scratch?.candidateTree
          : integration.targetTree;
    if (!expectedTree) {
      throw conflict('Merge candidate tree is not recorded.');
    }

    await verifyPublishedGitCheckout({
      root: targetPlan.root,
      expectedBranch: targetPlan.branch,
      expectedCommit,
      expectedTree,
    });
    await verifyCloseSpecificationTrees(record, integration.sourceCommit, expectedCommit);
    if (record.plan.occupants) {
      // Do not CAS before proving EVERY pinned ID, slug, status and location
      // on both physical sides. Inherited unbound Specs may exist, but no
      // bound source identity may disappear or alias another canonical entry.
      await Promise.all([
        listWorkspaceSpecifications(record.plan.source.root),
        listWorkspaceSpecifications(targetPlan.root),
      ]);
      for (const occupant of record.plan.occupants) {
        const [sourceSpec, targetSpec] = await Promise.all([
          readWorkspaceSpecification(record.plan.source.root, occupant.specId),
          readWorkspaceSpecification(targetPlan.root, occupant.specId),
        ]);
        for (const spec of [sourceSpec, targetSpec]) {
          if (
            spec.specId !== occupant.specId ||
            spec.slug !== occupant.slug ||
            spec.location !== occupant.location ||
            spec.status !== occupant.status
          ) {
            throw conflict('Canonical workspace occupant manifest changed before binding CAS.');
          }
        }
      }
    }

    if (integration.relationship === 'divergent') {
      if (record.scratch?.candidateCommit !== expectedCommit) {
        throw conflict('Published commit does not match the scratch candidate.');
      }

      await requireRecordedDivergentCandidate(engine, record);
    }

    // Journal fields can be structurally valid yet forged. Reconstruct the
    // complete pinned Git relationship independently: matching Spec bytes
    // alone do not prove source commits (including code changes) reached main.
    const ancestry = await inspectGitIntegrationEvidence({
      root: targetPlan.root,
      sourceCommit: integration.sourceCommit,
      targetCommit: integration.targetCommit,
    });
    if (
      ancestry.relationship !== integration.relationship ||
      ancestry.sourceCommit !== integration.sourceCommit ||
      ancestry.targetCommit !== integration.targetCommit ||
      ancestry.mergeBaseCommit !== integration.mergeBaseCommit ||
      ancestry.sourceTree !== integration.sourceTree ||
      ancestry.targetTree !== integration.targetTree
    ) {
      throw conflict('Pinned whole-branch Git ancestry does not match the Close journal.');
    }
  } catch {
    throw recovery('Close integration journal is not backed by a verified physical checkout.');
  }

  return record;
}

/**
 * T11 divergent publication: immutable candidate is produced in scratch,
 * but the checked-out PRIMARY must perform its own fast-forward. No bare
 * update-ref, checkout or reset in primary; no re-executing unknown effects.
 */
export async function publishDivergentCloseCandidate(
  engine: SpecFlowEngine,
  operationId: string,
  afterPersistedIntent?: () => Promise<void>,
): Promise<CloseJournal> {
  const record = await readCloseJournal(engine.context, operationId);
  if (
    record?.stage !== 'integration-scratch-candidate' ||
    (record.plan.kind !== 'worktree-close' &&
      record.plan.kind !== 'workspace-close' &&
      (record.plan.kind !== 'specification-close' || !record.archive?.committedHead)) ||
    record.integration?.relationship !== 'divergent' ||
    !record.scratch?.candidateCommit ||
    !record.scratch.candidateTree ||
    !record.plan.target
  ) {
    throw conflict('Complete divergent candidate required before Git publication.');
  }

  await requireRecordedDivergentCandidate(engine, record);
  const proof = await inspectCloseGitIntegration(engine, operationId);
  const original = record.integration;
  if (
    proof.relationship !== 'divergent' ||
    proof.sourceCommit !== original.sourceCommit ||
    proof.targetCommit !== original.targetCommit ||
    proof.mergeBaseCommit !== original.mergeBaseCommit ||
    proof.sourceTree !== original.sourceTree ||
    proof.targetTree !== original.targetTree
  ) {
    throw conflict('Git source or target changed after isolated candidate preparation.');
  }

  if (proof.projectConfigChanged) {
    throw new CloseOperationError(
      'CLOSE_PREFLIGHT',
      'Project-wide Git configuration changed without separate authority.',
    );
  }

  // From this point no exception authorizes a Git retry: the journal owns
  // both source and primary until an operator proves subprocess quiescence.
  const target = record.plan.target;
  const candidate = record.scratch.candidateCommit;
  const disabledHooksDirectory = await disabledIntegrationHooksDirectory(engine);
  await persistStage(engine, record, {
    ...record,
    stage: 'integration-publish-initiated',
  });
  await afterPersistedIntent?.();
  try {
    await publishGitFastForward({
      root: target.root,
      expectedTargetBranch: target.branch,
      expectedTargetCommit: original.targetCommit,
      disabledHooksDirectory,
      sourceCommit: candidate,
    });
  } catch {
    throw recovery('Divergent Git publication outcome is uncertain; reconcile without replay.');
  }

  return reconcileCloseGitPublication(engine, operationId, true);
}
