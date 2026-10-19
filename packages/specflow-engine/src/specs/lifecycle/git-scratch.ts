import { randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readFile, readdir, realpath } from 'node:fs/promises';

import { executeGit } from '../../git/process';
import { executeGitMutation } from '../../git/mutation';
import { join } from 'node:path';

import type { SpecFlowEngine } from '../../application';
import { readWorkspaceSpecification } from '../repository';
import { GitCapabilityError } from '../../git/errors';
import { isGitIgnored } from '../../project/git-checkout';
import { publishCloseCheckpoint } from './close-checkpoint';
import { readWorkspaceRegistry } from '../../project/workspace-registry';
import {
  createDetachedIntegrationCheckout,
  inspectDetachedIntegrationCheckout,
  mergeDivergentInScratch,
  verifyIntegrationCandidate,
  verifyIsolatedMergeConflict,
} from '../../version-control/git/integration-scratch';
import { readProjectGitPolicy } from '../../version-control/worktrees/config';
import { inspectCloseGitIntegration } from './git-integration';
import { readCloseJournal } from './journal-store';
import { CloseOperationError, type CloseJournal, type CloseIntegrationScratch } from './model';

const OWNER_MARKER = '.nevo/local/state/integration-scratch-owner.json';

function conflict(message: string): CloseOperationError {
  return new CloseOperationError('CLOSE_CONFLICT', message);
}
function recovery(message: string): CloseOperationError {
  return new CloseOperationError('CLOSE_RECOVERY_REQUIRED', message);
}
function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

async function createRealDirectory(path: string): Promise<void> {
  try {
    await mkdir(path, { mode: 0o700 });
  } catch (error) {
    if (
      typeof error !== 'object' ||
      error === null ||
      !('code' in error) ||
      error.code !== 'EEXIST'
    )
      throw error;
  }
  await requireDirectory(path);
}

async function requireDirectory(path: string): Promise<void> {
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (await realpath(path)) !== path) {
    throw recovery('Engine scratch directory has been redirected or replaced.');
  }
}

async function scratchDirectories(engine: SpecFlowEngine): Promise<{
  readonly root: string;
  readonly hooks: string;
}> {
  const state = engine.context.project.stateRoot;
  const engineRoot = join(state, 'engine');
  const root = join(engineRoot, 'integration-scratch');
  const hooks = join(engineRoot, 'integration-hooks-disabled');
  // Do not recursively traverse an unverified symlinked parent.
  await requireDirectory(state);
  for (const path of [engineRoot, root, hooks]) {
    await createRealDirectory(path);
  }
  if ((await readdir(hooks)).length !== 0) {
    throw recovery('Disabled-hook directory contains unexpected files.');
  }
  return { root, hooks };
}

/** Verified, empty Engine-owned hooks directory for all mutating integration Git operations. */
export async function disabledIntegrationHooksDirectory(engine: SpecFlowEngine): Promise<string> {
  return (await scratchDirectories(engine)).hooks;
}

async function requireAbsentScratch(path: string): Promise<void> {
  try {
    await lstat(path);
  } catch (error) {
    if (isMissing(error)) return;
    throw error;
  }
  throw recovery('Scratch path exists before its recorded Git creation; manual recovery required.');
}

async function putScratchOwner(
  engine: SpecFlowEngine,
  scratch: CloseIntegrationScratch,
  operationId: string,
): Promise<void> {
  const root = scratch.root;
  if (!(await isGitIgnored(root, OWNER_MARKER))) {
    throw recovery('Scratch owner identity would not be ignored by Git.');
  }
  for (const part of ['.nevo', '.nevo/local', '.nevo/local/state']) {
    const folder = join(root, part);
    await createRealDirectory(folder);
  }
  const ownerPath = join(root, OWNER_MARKER);
  const handle = await open(ownerPath, 'wx', 0o600);
  try {
    await handle.writeFile(
      JSON.stringify({
        version: 1,
        projectId: engine.context.project.projectId,
        operationId,
        instanceId: scratch.instanceId,
      }) + '\n',
    );
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function verifyScratchOwner(
  engine: SpecFlowEngine,
  scratch: CloseIntegrationScratch,
  operationId: string,
): Promise<void> {
  if (
    scratch.root !==
    join(engine.context.project.stateRoot, 'engine', 'integration-scratch', operationId)
  ) {
    throw recovery('Scratch path does not belong to the recorded Close operation.');
  }
  await requireDirectory(scratch.root);
  for (const part of ['.nevo', '.nevo/local', '.nevo/local/state']) {
    await requireDirectory(join(scratch.root, part));
  }
  const path = join(scratch.root, OWNER_MARKER);
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw recovery('Scratch checkout identity marker was replaced.');
  }
  const owner = JSON.parse(await readFile(path, 'utf8')) as unknown;
  if (
    typeof owner !== 'object' ||
    owner === null ||
    !('version' in owner) ||
    owner.version !== 1 ||
    !('projectId' in owner) ||
    owner.projectId !== engine.context.project.projectId ||
    !('operationId' in owner) ||
    owner.operationId !== operationId ||
    !('instanceId' in owner) ||
    owner.instanceId !== scratch.instanceId ||
    !(await isGitIgnored(scratch.root, OWNER_MARKER))
  ) {
    throw recovery('Scratch checkout belongs to a different physical owner.');
  }
}

async function publishScratchStage(
  engine: SpecFlowEngine,
  before: CloseJournal,
  after: CloseJournal,
): Promise<CloseJournal> {
  return publishCloseCheckpoint(engine, before, after, {
    onConflict: 'Close scratch journal changed during candidate preparation.',
    onReadbackFailure: 'Scratch checkpoint cannot be proved durable.',
    verifyCurrent: async () => {
      const registry = await readWorkspaceRegistry(engine.context);
      if (registry.revision !== before.plan.registryRevision)
        throw conflict('Workspace registry changed since Close reservation.');
      const policy = await readProjectGitPolicy(engine.context);
      if (
        policy.revision !== before.plan.configRevision ||
        policy.policy.integrationTargetBranch !== before.plan.targetBranch
      )
        throw conflict('Integration target policy changed since Close reservation.');
    },
  });
}

/**
 * Create and merge in an Engine-owned DETACHED Git worktree, never primary.
 * This is an internal T11 checkpoint only. Candidate publication to primary
 * needs a separate durable intent, branch fencing, and physical proof.
 *
 * On any unknown result, preserve the journal and scratch; never rerun Git.
 * A known conflict is recorded with exact index evidence, not settled Close.
 */
export async function prepareDivergentCloseCandidate(
  engine: SpecFlowEngine,
  operationId: string,
  afterScratchIntent?: () => Promise<void>,
): Promise<CloseJournal> {
  const before = await readCloseJournal(engine.context, operationId);
  if (
    before?.stage !== 'integration-preparation-initiated' ||
    (before.plan.kind !== 'worktree-close' &&
      (before.plan.kind !== 'specification-close' || !before.archive?.committedHead)) ||
    before.integration?.relationship !== 'divergent' ||
    !before.plan.target
  ) {
    throw conflict('Only a freshly prepared divergent Worktree Close may start scratch Git.');
  }
  const proof = await inspectCloseGitIntegration(engine, operationId);
  if (
    proof.relationship !== 'divergent' ||
    proof.sourceCommit !== before.integration.sourceCommit ||
    proof.targetCommit !== before.integration.targetCommit ||
    proof.mergeBaseCommit !== before.integration.mergeBaseCommit ||
    proof.sourceTree !== before.integration.sourceTree ||
    proof.targetTree !== before.integration.targetTree
  ) {
    throw conflict('Pinned Git ancestry changed before isolated merge.');
  }
  if (proof.projectConfigChanged) {
    throw new CloseOperationError(
      'CLOSE_PREFLIGHT',
      'Project-wide Git configuration changes require separate integration authority.',
    );
  }
  const directories = await scratchDirectories(engine);
  const root = join(directories.root, operationId);
  await requireAbsentScratch(root);
  const scratch: CloseIntegrationScratch = { root, instanceId: randomUUID() };
  const started = await publishScratchStage(engine, before, {
    ...before,
    stage: 'integration-scratch-initiated',
    scratch,
  });
  // Test-only crash point; no automatic replay if the caller terminates.
  await afterScratchIntent?.();
  try {
    await createDetachedIntegrationCheckout({
      projectRoot: before.plan.target.root,
      scratchRoot: root,
      targetCommit: before.integration.targetCommit,
      hooksDirectory: directories.hooks,
    });
    await inspectDetachedIntegrationCheckout({
      root,
      expectedGitCommonDir: engine.context.project.gitCommonDir,
      expectedCommit: before.integration.targetCommit,
      requireClean: true,
    });
    await putScratchOwner(engine, scratch, operationId);
    await verifyScratchOwner(engine, scratch, operationId);

    const merged = await mergeDivergentInScratch({
      scratchRoot: root,
      sourceCommit: before.integration.sourceCommit,
      targetCommit: before.integration.targetCommit,
      hooksDirectory: directories.hooks,
    });
    await verifyScratchOwner(engine, scratch, operationId);
    if (merged.status === 'conflict') {
      // A nonzero Git exit is only a KNOWN conflict after proving exact
      // MERGE_HEAD, ORIG_HEAD, and staged index bytes in scratch.
      await verifyIsolatedMergeConflict({
        scratchRoot: root,
        expectedGitCommonDir: engine.context.project.gitCommonDir,
        sourceCommit: before.integration.sourceCommit,
        targetCommit: before.integration.targetCommit,
        conflictPaths: merged.conflictPaths,
        conflictIndexHash: merged.conflictIndexHash,
      });
      return publishScratchStage(engine, started, {
        ...started,
        stage: 'integration-scratch-conflict',
        scratch: {
          ...scratch,
          conflictPaths: merged.conflictPaths,
          conflictIndexHash: merged.conflictIndexHash,
        },
      });
    }

    await verifyIntegrationCandidate({
      scratchRoot: root,
      expectedGitCommonDir: engine.context.project.gitCommonDir,
      targetCommit: before.integration.targetCommit,
      sourceCommit: before.integration.sourceCommit,
      candidateCommit: merged.candidateCommit,
      candidateTree: merged.candidateTree,
      specificationPath:
        'specs/' + (before.archive ? 'archive' : before.plan.location) + '/' + before.plan.slug,
    });
    return publishScratchStage(engine, started, {
      ...started,
      stage: 'integration-scratch-candidate',
      scratch: {
        ...scratch,
        candidateCommit: merged.candidateCommit,
        candidateTree: merged.candidateTree,
      },
    });
  } catch (error) {
    // Do not cleanup, retry, repin, or release original source/target claims.
    if (error instanceof CloseOperationError && error.code === 'CLOSE_RECOVERY_REQUIRED') {
      throw error;
    }
    if (error instanceof GitCapabilityError) {
      throw recovery('Scratch Git result is uncertain; preserve checkout and recheck ownership.');
    }
    throw recovery('Scratch candidate is not proven; preserve intent and inspect before recovery.');
  }
}

/** Read-only verification of a candidate checkpoint, without replaying Git. */
export async function verifyDivergentCloseCandidate(
  engine: SpecFlowEngine,
  operationId: string,
): Promise<CloseJournal> {
  const journal = await readCloseJournal(engine.context, operationId);
  if (journal?.stage !== 'integration-scratch-candidate') {
    throw recovery('No durable complete divergent candidate exists.');
  }
  await requireRecordedDivergentCandidate(engine, journal);
  return journal;
}

/** T11 physical candidate proof shared with publication and recovery. */
export async function requireRecordedDivergentCandidate(
  engine: SpecFlowEngine,
  journal: CloseJournal,
): Promise<void> {
  const scratch = journal.scratch;
  const integration = journal.integration;
  if (
    !scratch?.candidateCommit ||
    !scratch.candidateTree ||
    integration?.relationship !== 'divergent' ||
    !journal.plan.target
  )
    throw recovery('Durable divergent candidate evidence is absent.');
  try {
    await verifyScratchOwner(engine, scratch, journal.plan.operationId);
    await verifyIntegrationCandidate({
      scratchRoot: scratch.root,
      expectedGitCommonDir: engine.context.project.gitCommonDir,
      sourceCommit: integration.sourceCommit,
      targetCommit: integration.targetCommit,
      candidateCommit: scratch.candidateCommit,
      candidateTree: scratch.candidateTree,
      specificationPath:
        'specs/' + (journal.archive ? 'archive' : journal.plan.location) + '/' + journal.plan.slug,
    });
  } catch {
    throw recovery('Scratch candidate ownership, parents, index or physical tree is unproven.');
  }
}

/** A known conflicted merge is NEVER an integrated or completed Close. */
export async function verifyDivergentCloseConflict(
  engine: SpecFlowEngine,
  operationId: string,
): Promise<CloseJournal> {
  const journal = await readCloseJournal(engine.context, operationId);
  if (
    journal?.stage !== 'integration-scratch-conflict' ||
    !journal.integration ||
    !journal.scratch?.conflictPaths ||
    !journal.scratch.conflictIndexHash
  )
    throw recovery('No durable known-conflict evidence exists.');
  try {
    await verifyScratchOwner(engine, journal.scratch, operationId);
    await verifyIsolatedMergeConflict({
      scratchRoot: journal.scratch.root,
      expectedGitCommonDir: engine.context.project.gitCommonDir,
      targetCommit: journal.integration.targetCommit,
      sourceCommit: journal.integration.sourceCommit,
      conflictPaths: journal.scratch.conflictPaths,
      conflictIndexHash: journal.scratch.conflictIndexHash,
    });
  } catch {
    throw recovery('Scratch conflict owner, merge inputs or staged conflict were modified.');
  }
  return journal;
}

/**
 * Safe retained-scratch conflict disposition, without falsely completing a
 * Worktree Close or freeing source/target Git ownership. This is the Engine
 * handoff for a future human/agent conflict-resolution UI; no agent is run.
 *
 * Linked Specification archival cannot be marked completed here: T14 owns
 * the post-archive source commit and T15 owns canonical archival/binding.
 */
export interface DivergentCloseNeedsResolution {
  readonly status: 'requires-resolution';
  readonly disposition: 'retained-scratch';
  readonly operationId: string;
  readonly sourceCommit: string;
  readonly targetCommit: string;
  readonly mergeBaseCommit: string;
  readonly scratchRoot: string;
  readonly scratchInstanceId: string;
  readonly conflictPaths: readonly string[];
  readonly conflictIndexHash: string;
  readonly resourcesRemainReserved: true;
}

export async function inspectDivergentCloseResolution(
  engine: SpecFlowEngine,
  operationId: string,
): Promise<DivergentCloseNeedsResolution> {
  const journal = await verifyDivergentCloseConflict(engine, operationId);
  const proof = await inspectCloseGitIntegration(engine, operationId);
  if (
    proof.relationship !== 'divergent' ||
    proof.sourceCommit !== journal.integration?.sourceCommit ||
    proof.targetCommit !== journal.integration?.targetCommit ||
    proof.mergeBaseCommit !== journal.integration?.mergeBaseCommit ||
    proof.sourceTree !== journal.integration?.sourceTree ||
    proof.targetTree !== journal.integration?.targetTree
  ) {
    throw recovery('Known conflict has changed source or primary Git evidence.');
  }
  const scratch = journal.scratch;
  const integration = journal.integration;
  if (!scratch?.conflictPaths || !scratch.conflictIndexHash || !integration) {
    throw recovery('Known conflict is missing durable evidence.');
  }
  return {
    status: 'requires-resolution',
    disposition: 'retained-scratch',
    operationId,
    sourceCommit: integration.sourceCommit,
    targetCommit: integration.targetCommit,
    mergeBaseCommit: integration.mergeBaseCommit,
    scratchRoot: scratch.root,
    scratchInstanceId: scratch.instanceId,
    conflictPaths: scratch.conflictPaths,
    conflictIndexHash: scratch.conflictIndexHash,
    resourcesRemainReserved: true,
  };
}

/**
 * A KNOWN conflict after the archive commit settles the Specification Close
 * without integrating it. The source remains canonical in its original linked
 * checkout, and the Engine retains scratch ownership for future recovery.
 * Never classify an uncertain merge or a missing scratch as settled.
 */
export async function settleArchivedLinkedConflict(
  engine: SpecFlowEngine,
  operationId: string,
): Promise<CloseJournal> {
  const record = await readCloseJournal(engine.context, operationId);
  if (
    record?.stage !== 'integration-scratch-conflict' ||
    record.plan.kind !== 'specification-close' ||
    !record.archive?.committedHead ||
    !record.scratch?.conflictPaths?.length
  ) {
    throw conflict('A verified post-archive linked merge conflict is required.');
  }
  await inspectDivergentCloseResolution(engine, operationId);
  const registry = await readWorkspaceRegistry(engine.context);
  const binding = registry.specBindings.find((x) => x.specId === record.plan.specId);
  if (
    registry.revision !== record.plan.registryRevision ||
    binding?.workspaceId !== record.plan.source.workspaceId ||
    binding.generation !== record.plan.bindingGeneration
  ) {
    throw recovery('Canonical archived linked binding was changed during conflict handling.');
  }
  const archived = await readWorkspaceSpecification(record.plan.source.root, record.plan.specId);
  if (archived.location !== 'archive' || archived.status !== 'archived')
    throw recovery('Cannot settle conflict without a canonical archived source.');
  return publishScratchStage(engine, record, {
    ...record,
    stage: 'archived-linked-awaiting-integration',
    outcome: 'archived-linked-awaiting-integration',
  });
}

/**
 * T11 disposal: the original scratch owner marker survives until Git itself
 * removes the checkout. Never unlink the marker first or use --force.
 * Called only after a durable disposal-initiated journal checkpoint.
 */
export async function removeVerifiedIntegrationScratch(
  engine: SpecFlowEngine,
  journal: CloseJournal,
): Promise<void> {
  if (
    journal.stage !== 'disposal-initiated' ||
    !journal.scratch ||
    journal.integration?.relationship !== 'divergent'
  ) {
    throw recovery('Divergent scratch disposal needs durable, pinned intent.');
  }
  await requireRecordedDivergentCandidate(engine, journal);

  // A clean Git status alone misses ignored data, so enumerate the whole
  // checkout and authorize just the single verified owner marker.
  const root = journal.scratch.root;
  const tracked = await executeGit(root, ['ls-files', '-z', '--cached', '--full-name']);
  if (tracked.exitCode !== 0) throw recovery('Cannot inventory scratch Git index.');
  const indexed = new Set(tracked.stdout.split('\0').filter(Boolean));
  let visited = 0;
  async function walk(relative: string): Promise<void> {
    for (const entry of await readdir(join(root, relative), { withFileTypes: true })) {
      if (++visited > 100000) throw recovery('Scratch inventory exceeded safety bound.');
      const name = relative ? relative + '/' + entry.name : entry.name;
      if (entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile()))
        throw recovery('Scratch contains an unknown filesystem entry.');
      if (entry.isDirectory()) await walk(name);
      else if (name !== OWNER_MARKER && !(name === '.git' && !relative) && !indexed.has(name))
        throw recovery('Unrecognized ignored/untracked scratch content blocks cleanup.');
    }
  }
  await walk('');
  // Git knows this checkout and its physical incarnation was just verified.
  // A nonzero result is uncertain: preserve journal ownership, never retry.
  try {
    const result = await executeGitMutation(engine.context.project.homeRoot, [
      'worktree',
      'remove',
      '--',
      root,
    ]);
    if (result.exitCode !== 0) throw recovery('Git refused non-force scratch removal.');
  } catch {
    throw recovery('Scratch removal outcome is uncertain; inspect Git without replay.');
  }
  await proveIntegrationScratchAbsent(engine, journal);
}

/** Pure post-effect proof, safe even after scratch metadata disappears. */
export async function proveIntegrationScratchAbsent(
  engine: SpecFlowEngine,
  journal: CloseJournal,
): Promise<void> {
  const scratch = journal.scratch;
  if (!scratch) return;
  try {
    await lstat(scratch.root);
    throw recovery('Integration scratch path still exists.');
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
  const listed = await executeGit(engine.context.project.homeRoot, [
    'worktree',
    'list',
    '--porcelain',
    '-z',
  ]);
  if (
    listed.exitCode !== 0 ||
    listed.stdout.split('\0').some((entry) => entry === 'worktree ' + scratch.root)
  )
    throw recovery('Git still registers the temporary integration checkout.');
}

/**
 * Explicit operator reconciliation of retained conflict scratch. Never
 * retry or force-remove Git: the operator must first resolve/abort the
 * conflict, remove the scratch checkout and confirm Git is no longer running.
 *
 * A later Worktree Close gets a NEW immutable integration intent and can
 * independently verify the still-archived canonical linked Specification.
 */
export async function reconcileArchivedConflictScratch(
  engine: SpecFlowEngine,
  operationId: string,
  confirmedNoActiveGitProcess: boolean,
): Promise<CloseJournal> {
  const record = await readCloseJournal(engine.context, operationId);
  if (
    record?.stage !== 'archived-linked-awaiting-integration' ||
    !record.archive?.committedHead ||
    !record.scratch?.conflictPaths?.length
  ) {
    throw conflict('No settled linked archive conflict scratch to reconcile.');
  }
  if (!confirmedNoActiveGitProcess)
    throw recovery('Cannot retire scratch while Git execution may still be active.');
  await proveIntegrationScratchAbsent(engine, record);
  const registry = await readWorkspaceRegistry(engine.context);
  const binding = registry.specBindings.find((item) => item.specId === record.plan.specId);
  if (
    registry.revision !== record.plan.registryRevision ||
    binding?.workspaceId !== record.plan.source.workspaceId ||
    binding.generation !== record.plan.bindingGeneration
  ) {
    throw recovery('Canonical archived linked binding changed during scratch reconciliation.');
  }
  const archived = await readWorkspaceSpecification(record.plan.source.root, record.plan.specId);
  if (archived.location !== 'archive' || archived.status !== 'archived')
    throw recovery('Archived linked canonical source is no longer available.');
  if (record.scratchRetired === true) return record;
  // The short Project Home lock serializes the claim release with new Create/Close.
  // Do not perform Git subprocess operations under the lock.
  return publishScratchStage(engine, record, { ...record, scratchRetired: true });
}
