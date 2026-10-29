import { lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import type { SpecFlowEngine } from '../../application';
import { executeGitMutation } from '../../git/mutation';
import { executeGit } from '../../git/process';
import { publishCloseCheckpoint } from './close/checkpoint';
import {
  WorkspaceRegistryError,
  inspectRegisteredWorkspace,
  readWorkspaceRegistry,
  type WorkspaceRegistry,
} from '../../project/workspace/registry/registry';
import { WORKSPACE_IDENTITY_RELATIVE_PATH } from '../../project/workspace/identity';
import {
  rebindLifecycleSpec,
  retireLifecycleWorkspace,
  type LifecycleRegistryCAS,
} from './registry-lifecycle';
import {
  verifyPublishedGitCheckout,
  verifyGitTreePathEquivalent,
} from '../../version-control/git/integration';
import {
  proveIntegrationScratchAbsent,
  removeVerifiedIntegrationScratch,
  requireRecordedDivergentCandidate,
} from './git/scratch';
import { requireVerifiedCloseIntegration } from './git/publication';
import { readCloseJournal } from './journal/store';
import { CloseOperationError, type CloseJournal } from './model';
import { inspectCleanGitWorkspace } from './preflight';
import { assertResourcesAvailable } from './resources';

function conflict(message: string): CloseOperationError {
  return new CloseOperationError('CLOSE_CONFLICT', message);
}

function recovery(message: string): CloseOperationError {
  return new CloseOperationError('CLOSE_RECOVERY_REQUIRED', message);
}

function claim(journal: CloseJournal): LifecycleRegistryCAS {
  const plan = journal.plan;
  if (
    (plan.kind !== 'worktree-close' &&
      plan.kind !== 'workspace-close' &&
      !(
        plan.kind === 'specification-close' &&
        plan.integrateToTargetBranch === true &&
        !!journal.archive?.committedHead
      )) ||
    !plan.source.instanceId ||
    !plan.target ||
    plan.bindingGeneration === undefined
  ) {
    throw recovery('Close source/target identity or binding generation absent.');
  }

  return {
    operationId: plan.operationId,
    specId: plan.specId,
    ...(plan.occupants ? { occupants: plan.occupants } : {}),
    sourceWorkspaceId: plan.source.workspaceId,
    sourceInstanceId: plan.source.instanceId,
    sourceRoot: plan.source.root,
    targetWorkspaceId: plan.target.workspaceId,
    targetRoot: plan.target.root,
    ...(plan.target.instanceId ? { targetInstanceId: plan.target.instanceId } : {}),
    expectedBindingGeneration: plan.bindingGeneration,
    expectedRegistryRevision: plan.registryRevision,
    resources: plan.resources,
  };
}

async function stage(
  engine: SpecFlowEngine,
  prior: CloseJournal,
  next: CloseJournal,
): Promise<CloseJournal> {
  return publishCloseCheckpoint(engine, prior, next, {
    onConflict: 'Concurrent Close journal transition.',
    onReadbackFailure: 'Close state checkpoint did not persist.',
    verifyCurrent: async () => {
      await assertResourcesAvailable(engine.context, prior.plan.resources, {
        kind: 'close',
        operationId: prior.plan.operationId,
      });
    },
  });
}

async function assertPublication(engine: SpecFlowEngine, record: CloseJournal): Promise<void> {
  const target = record.plan.target,
    integration = record.integration;
  if (!target || !integration?.publishedCommit) {
    throw recovery('Close integration has no durable published target proof.');
  }

  const tree =
    integration.relationship === 'fast-forward'
      ? integration.sourceTree
      : integration.relationship === 'divergent'
        ? record.scratch?.candidateTree
        : integration.targetTree;
  if (!tree) {
    throw recovery('Published integration tree evidence is absent.');
  }

  await verifyPublishedGitCheckout({
    root: target.root,
    expectedBranch: target.branch,
    expectedCommit: integration.publishedCommit,
    expectedTree: tree,
  });
  if (integration.relationship === 'divergent') {
    const candidate = record.scratch?.candidateCommit;
    const candidateTree = record.scratch?.candidateTree;
    if (candidate !== integration.publishedCommit || !candidateTree) {
      throw recovery('Divergent publication does not match the durable candidate.');
    }

    const [parents, tree] = await Promise.all([
      executeGit(target.root, ['rev-list', '--parents', '-n', '1', candidate]),
      executeGit(target.root, ['rev-parse', '--verify', candidate + '^{tree}']),
    ]);
    if (
      parents.exitCode !== 0 ||
      parents.stdout.trim() !==
        [candidate, integration.targetCommit, integration.sourceCommit].join(' ') ||
      tree.exitCode !== 0 ||
      tree.stdout.trim() !== candidateTree
    ) {
      throw recovery('Published divergent commit has unexpected parents or tree.');
    }

    for (const entry of record.plan.occupants ?? [
      {
        slug: record.plan.slug,
        location: record.archive ? ('archive' as const) : record.plan.location,
      },
    ]) {
      await verifyGitTreePathEquivalent(
        target.root,
        integration.sourceCommit,
        candidate,
        'specs/' + entry.location + '/' + entry.slug,
      );
    }

    // During disposal the scratch may ALREADY have been physically removed.
    // The immutable candidate SHA/tree/parents and published primary are the
    // remaining authority; never recreate scratch from its path.
    if (record.stage !== 'disposal-initiated') {
      await requireRecordedDivergentCandidate(engine, record);
    }
  }
}

function reboundBinding(registry: WorkspaceRegistry, record: CloseJournal): boolean {
  const ids = record.plan.occupants?.map((x) => x.specId) ?? [record.plan.specId];

  return (
    ids.every((specId) => {
      const entry = registry.specBindings.find((x) => x.specId === specId);

      return (
        entry?.workspaceId === record.plan.target?.workspaceId &&
        entry?.generation === record.plan.registryRevision + 1
      );
    }) &&
    !registry.specBindings.some((x) => x.workspaceId === record.plan.source.workspaceId) &&
    registry.revision === record.plan.registryRevision + 1
  );
}

/**
 * First CAS rebind to the verified destination, then journal. If killed between files, a new
 * call verifies exactly the same resulting CAS instead of writing it again.
 */
export async function rebindVerifiedClose(
  engine: SpecFlowEngine,
  operationId: string,
  afterRegistryCAS?: () => Promise<void>,
): Promise<CloseJournal> {
  const journal = await readCloseJournal(engine.context, operationId);
  if (journal?.stage !== 'integration-verified') {
    if (journal?.stage === 'binding-rebound') {
      return journal;
    }

    throw conflict('Binding rebind requires verified integration.');
  }

  const c = claim(journal);
  const now = await readWorkspaceRegistry(engine.context);
  if (!reboundBinding(now, journal)) {
    await requireVerifiedCloseIntegration(engine, operationId);
    await rebindLifecycleSpec(engine.context, c);
    // Test-only barrier between durable registry CAS and Close journal update.
    await afterRegistryCAS?.();
  } else {
    // Journal write crashed after registry CAS: prove the target and source
    // before accepting the recorded one-step revision as our transition.
    await assertPublication(engine, journal);
    const source = now.workspaces.find((x) => x.workspaceId === c.sourceWorkspaceId);
    if (source?.kind !== 'linked' || source.instanceId !== c.sourceInstanceId) {
      throw recovery('Rebind result exists but source incarnation changed.');
    }
  }

  const registry = await readWorkspaceRegistry(engine.context);
  if (!reboundBinding(registry, journal)) {
    throw recovery('Binding rebind was not durable.');
  }

  await assertPublication(engine, journal);

  return stage(engine, journal, {
    ...journal,
    stage: 'binding-rebound',
    reboundRevision: registry.revision,
  });
}

async function sourceInventorySafe(root: string): Promise<void> {
  // A physically clean Git status does NOT reveal ignored user data. Every
  // physical file is checked against the index, except Git's own .git pointer
  // and the ONE independently verified Engine incarnation marker.
  const tracked = await executeGit(root, ['ls-files', '-z', '--cached', '--full-name']);
  if (tracked.exitCode !== 0) {
    throw recovery('Cannot inspect exact source Git index.');
  }

  const names = new Set(tracked.stdout.split('\0').filter(Boolean));
  let entries = 0;
  async function visit(relative: string): Promise<void> {
    for (const e of await readdir(join(root, relative), { withFileTypes: true })) {
      if (++entries > 100000) {
        throw recovery('Source filesystem inventory is too large.');
      }

      const path = relative ? relative + '/' + e.name : e.name;
      if (e.isSymbolicLink() || (!e.isDirectory() && !e.isFile())) {
        throw recovery('Unknown filesystem entry in managed worktree.');
      }

      if (!relative && e.name === '.git' && e.isFile()) {
        continue;
      }

      if (e.isDirectory()) {
        await visit(path);
      } else if (path !== WORKSPACE_IDENTITY_RELATIVE_PATH && !names.has(path)) {
        throw recovery('Unknown ignored or untracked source file blocks disposal: ' + path);
      }
    }
  }

  await visit('');
}

async function sourceMissing(root: string): Promise<boolean> {
  try {
    await lstat(root);

    return false;
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
      return true;
    }

    throw error;
  }
}

async function proveGitUnregistered(engine: SpecFlowEngine, root: string): Promise<void> {
  if (!(await sourceMissing(root))) {
    throw recovery('Source checkout still exists.');
  }

  const output = await executeGit(engine.context.project.homeRoot, [
    'worktree',
    'list',
    '--porcelain',
    '-z',
  ]);
  if (
    output.exitCode !== 0 ||
    output.stdout.split('\0').some((entry) => entry === 'worktree ' + root)
  ) {
    throw recovery('Git still registers source worktree or metadata is unavailable.');
  }
}

/**
 * Never delete arbitrary ignored data, force-remove worktrees, delete branches,
 * or mark settlement if Git effect was uncertain. Rebind was already durable.
 */
export async function disposeReboundWorktree(
  engine: SpecFlowEngine,
  operationId: string,
  afterDisposalIntent?: () => Promise<void>,
  afterGitRemoval?: () => Promise<void>,
): Promise<CloseJournal> {
  const current = await readCloseJournal(engine.context, operationId);
  if (current?.stage !== 'binding-rebound' || !current.reboundRevision) {
    throw conflict('Managed disposal requires a recorded destination binding.');
  }

  const c = claim(current);
  const registry = await engine.readRegistry();
  if (!reboundBinding(registry, current)) {
    throw recovery('Destination binding is no longer the exact CAS result.');
  }

  await assertPublication(engine, current);
  const registration = registry.workspaces.find((x) => x.workspaceId === c.sourceWorkspaceId);
  if (
    registration?.kind !== 'linked' ||
    !registration.managed ||
    registration.instanceId !== c.sourceInstanceId ||
    registration.root !== c.sourceRoot
  ) {
    throw recovery('Disposal target is no longer the exclusively managed source.');
  }

  let observed;
  try {
    observed = await inspectRegisteredWorkspace(engine.context, registry, registration.workspaceId);
  } catch (error) {
    if (
      error instanceof WorkspaceRegistryError &&
      (error.code === 'REGISTRY_WORKSPACE_MISMATCH' ||
        error.code === 'REGISTRY_WORKSPACE_UNAVAILABLE')
    ) {
      throw recovery(
        'Linked checkout incarnation changed; do not remove or retire this workspace.',
      );
    }

    throw error;
  }

  if (observed.status !== 'available') {
    throw recovery('Cannot inspect the original linked worktree incarnation.');
  }

  const facts = await inspectCleanGitWorkspace(registration);
  if (
    facts.head !== (current.archive?.committedHead ?? current.plan.source.head) ||
    facts.branch !== current.plan.source.branch
  ) {
    throw recovery('Source Git branch/head changed since verified integration.');
  }

  await sourceInventorySafe(registration.root);
  // TODO(workspace-execution): connect real active writer/session/claim quiescence admission here when implemented.
  const intent = await stage(engine, current, { ...current, stage: 'disposal-initiated' });
  await afterDisposalIntent?.();

  // The owned marker MUST remain in the checkout until Git removes the whole
  // worktree. Non-force Git accepts the ignored marker (the inventory excludes
  // other ignored/untracked files). A failed remove no longer destroys proof
  // of the surviving checkout's physical incarnation.
  //
  // Scratch cleanup is owned by the SAME durable disposal intent; completed
  // is forbidden until BOTH linked source and divergent scratch disappear.
  if (intent.scratch) {
    await removeVerifiedIntegrationScratch(engine, intent);
  }

  const result = await executeGitMutation(engine.context.project.homeRoot, [
    'worktree',
    'remove',
    '--',
    registration.root,
  ]);
  if (result.exitCode !== 0) {
    throw recovery('Non-force worktree removal failed; checkout marker and resource claim remain.');
  }

  // Test-only crash point AFTER Git has physically removed its registered
  // checkout but BEFORE durable registry retirement and journal settlement.
  await afterGitRemoval?.();

  return reconcileDisposedWorktree(engine, operationId, true);
}

/** Confirm a completed physical effect; never retry Git remove after uncertainty. */
export async function reconcileDisposedWorktree(
  engine: SpecFlowEngine,
  operationId: string,
  confirmedNoActiveGitProcess: boolean,
): Promise<CloseJournal> {
  const record = await readCloseJournal(engine.context, operationId);
  if (record?.stage !== 'disposal-initiated' || !record.reboundRevision) {
    throw conflict('No pending managed disposal operation exists.');
  }

  if (!confirmedNoActiveGitProcess) {
    throw recovery('Cannot reconcile an active/unknown Git worktree subprocess.');
  }

  const c = claim(record);
  await proveGitUnregistered(engine, c.sourceRoot);
  await proveIntegrationScratchAbsent(engine, record);
  await assertPublication(engine, record);
  const registry = await readWorkspaceRegistry(engine.context);
  if (reboundBinding(registry, record)) {
    await retireLifecycleWorkspace(engine.context, c, record.reboundRevision);
  } else {
    const ids = c.occupants?.map((x) => x.specId) ?? [c.specId];
    if (
      registry.revision !== record.reboundRevision + 1 ||
      registry.workspaces.some((x) => x.workspaceId === c.sourceWorkspaceId) ||
      ids.some((specId) => {
        const rebound = registry.specBindings.find((x) => x.specId === specId);

        return (
          rebound?.workspaceId !== c.targetWorkspaceId ||
          rebound.generation !== record.reboundRevision
        );
      }) ||
      registry.specBindings.some((x) => x.workspaceId === c.sourceWorkspaceId)
    ) {
      throw recovery('Registry retirement effect cannot be uniquely attributed to Close.');
    }
  }

  const after = await readWorkspaceRegistry(engine.context);
  if (after.workspaces.some((x) => x.workspaceId === c.sourceWorkspaceId)) {
    throw recovery('Source registration still exists after physical removal.');
  }

  return stage(engine, record, {
    ...record,
    stage: 'completed',
    outcome:
      record.plan.kind === 'specification-close'
        ? 'integrated-and-removed'
        : 'worktree-integrated-and-removed',
  });
}

/**
 * Read-only diagnosis after an uncertain non-force remove.
 * Do not restore a lost marker based on a matching pathname. A swapped
 * checkout is explicitly classified as foreign, never adopted or deleted.
 */
export async function inspectPendingDisposal(
  engine: SpecFlowEngine,
  operationId: string,
): Promise<'original-checkout-present' | 'source-removed' | 'identity-mismatch'> {
  const record = await readCloseJournal(engine.context, operationId);
  if (record?.stage !== 'disposal-initiated') {
    throw conflict('Disposal inspection requires an interrupted durable removal intent.');
  }

  const registry = await readWorkspaceRegistry(engine.context);
  const registration = registry.workspaces.find(
    (item) => item.workspaceId === record.plan.source.workspaceId,
  );
  if (
    !registration?.instanceId ||
    registration.instanceId !== record.plan.source.instanceId ||
    registration.root !== record.plan.source.root
  ) {
    throw recovery('Disposal registry no longer identifies the reserved source.');
  }

  if (await sourceMissing(registration.root)) {
    return 'source-removed';
  }

  try {
    const observed = await inspectRegisteredWorkspace(
      engine.context,
      registry,
      registration.workspaceId,
    );
    if (observed.status !== 'available') {
      return 'identity-mismatch';
    }

    const facts = await inspectCleanGitWorkspace(registration);
    if (
      facts.head !== (record.archive?.committedHead ?? record.plan.source.head) ||
      facts.branch !== record.plan.source.branch
    ) {
      return 'identity-mismatch';
    }

    return 'original-checkout-present';
  } catch {
    return 'identity-mismatch';
  }
}
