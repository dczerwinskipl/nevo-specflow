import { lstat, readFile } from 'node:fs/promises';
import { basename, isAbsolute, join, resolve } from 'node:path';

import type { SpecFlowEngine } from '../../../application';
import { GitCapabilityError } from '../../../git/errors';
import { executeGit } from '../../../git/process';
import { openVersionControl } from '../../../version-control';
import { assertWorktreeTargetOutsideRepository } from '../../../version-control/worktrees/policy';
import type { WorktreePlan, WorktreeEffect } from '../../../version-control/worktrees/port';
import {
  inspectRegisteredWorkspace,
  verifyWorkspaceRoot,
  type WorkspaceRegistration,
} from '../../../project/workspace-registry';
import {
  WORKSPACE_IDENTITY_RELATIVE_PATH,
  provisionLinkedWorkspaceIdentity,
  verifyLinkedWorkspaceIdentity,
} from '../../../project/workspace-identity';
import { CreateOperationError, type CreateJournal } from '../journal';
import { registrationOf } from '../binding/registration';
import { requireCommitLineage } from './commit';

/**
 * Reconstruct a fixed plan from durable evidence, never from the latest naming
 * policy. Verify the recorded Git instance against the authoritative Project Home.
 */
export function planFromCreateJournal(engine: SpecFlowEngine, record: CreateJournal): WorktreePlan {
  const target = record.target;
  if (
    target.kind !== 'new-worktree' ||
    !target.branch ||
    !target.baseCommit ||
    record.gitPlan?.projectRoot !== engine.context.project.homeRoot ||
    record.gitPlan?.gitInstanceId !== engine.context.project.gitInstanceId
  ) {
    throw recovery('Create journal has no valid pinned Git worktree plan.');
  }
  // The target is the absolute path pinned at reservation: it may live under a worktree
  // folder that was configured at that time. It must still be the reserved slug's folder,
  // and outside the repository; a different child is NOT equivalent.
  const home = engine.context.project.homeRoot;
  const actualTarget = target.workspaceRoot;
  let outside = true;
  try {
    assertWorktreeTargetOutsideRepository(home, engine.context.project.gitCommonDir, actualTarget);
  } catch {
    outside = false;
  }
  if (
    !isAbsolute(actualTarget) ||
    resolve(actualTarget) !== actualTarget ||
    basename(actualTarget) !== record.slug ||
    !outside
  ) {
    throw recovery('Journal worktree target does not match the originally reserved slug.');
  }
  return {
    projectId: record.projectId,
    gitInstanceId: engine.context.project.gitInstanceId,
    projectRoot: home,
    targetPath: actualTarget,
    branch: target.branch,
    baseCommit: target.baseCommit,
  };
}

/**
 * For a reserved operation, policy fences NEW mutations, but is not consulted
 * for effects inspection or post-Git recovery. Do not re-resolve baseRef.
 */
/** Destination identity is rechecked outside all control locks. */
export async function verifyPinnedIntegrationDestination(
  engine: SpecFlowEngine,
  record: CreateJournal,
): Promise<void> {
  if (record.target.kind !== 'new-worktree' || !record.target.integrationDestination) return;
  const pinned = record.target.integrationDestination;
  const registry = await engine.readRegistry();
  const stored = registry.workspaces.find(
    (workspace) => workspace.workspaceId === pinned.workspaceId,
  );
  if (!stored || stored.instanceId !== pinned.instanceId) {
    throw recovery('Pinned integration destination registration changed.');
  }
  const inspected = await inspectRegisteredWorkspace(engine.context, registry, pinned.workspaceId);
  if (inspected.status !== 'available') {
    throw recovery('Pinned integration destination is unavailable.');
  }
  const attached = await executeGit(inspected.root, ['symbolic-ref', '--quiet', 'HEAD']);
  if (attached.exitCode !== 0 || attached.stdout.trim() !== 'refs/heads/' + pinned.branch) {
    throw recovery('Pinned integration destination branch or checkout changed.');
  }
}

export async function validateNewGitReservation(
  engine: SpecFlowEngine,
  record: CreateJournal,
): Promise<void> {
  const worktrees = openVersionControl(engine).worktrees;
  const availability = await worktrees.availability();
  if (availability.status === 'disabled') {
    throw new GitCapabilityError('GIT_DISABLED', 'Managed worktree creation is disabled.');
  }
  if (availability.status === 'unavailable') {
    throw new GitCapabilityError('GIT_UNAVAILABLE', 'Git worktree automation is unavailable.');
  }
  await worktrees.validateReservedPlan(planFromCreateJournal(engine, record));
  await verifyPinnedIntegrationDestination(engine, record);
  // A newly reserved plan must have no evidence of a previous effect.
  // An interrupted git-initiated stage takes a separate explicit recovery route.
  if ((await worktrees.inspectEffect(planFromCreateJournal(engine, record))) !== 'absent') {
    throw recovery('Git branch or worktree differs from the reserved intent.');
  }
}

export async function inspectPlannedGitEffect(
  engine: SpecFlowEngine,
  record: CreateJournal,
): Promise<WorktreeEffect> {
  return openVersionControl(engine).worktrees.inspectEffect(planFromCreateJournal(engine, record));
}

export async function createPlannedGitWorktree(
  engine: SpecFlowEngine,
  record: CreateJournal,
): Promise<void> {
  // The caller is Durable Create only, after its persisted git-initiated stage.
  // This module does not publish or modify journal/registry state.
  await openVersionControl(engine).worktrees.create(planFromCreateJournal(engine, record));
}

export async function ensureLinkedIdentity(
  engine: SpecFlowEngine,
  record: CreateJournal,
): Promise<CreateJournal> {
  if (record.target.kind !== 'new-worktree' || !record.target.instanceId) {
    throw recovery('Managed checkout has no reserved physical identity.');
  }
  const path = join(record.target.workspaceRoot, WORKSPACE_IDENTITY_RELATIVE_PATH);
  let registration: WorkspaceRegistration;
  try {
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink()) throw recovery('Identity marker redirected.');
    const parsed = JSON.parse(await readFile(path, 'utf8')) as unknown;
    if (
      !isRecord(parsed) ||
      parsed.version !== 1 ||
      parsed.projectId !== record.projectId ||
      parsed.workspaceId !== record.target.workspaceId ||
      typeof parsed.instanceId !== 'string' ||
      parsed.instanceId !== record.target.instanceId
    ) {
      throw recovery('Identity marker belongs to a different worktree; manual repair required.');
    }
    registration = {
      kind: 'linked',
      managed: true,
      workspaceId: record.target.workspaceId,
      root: record.target.workspaceRoot,
      instanceId: parsed.instanceId,
    };
  } catch (error) {
    if (!isMissing(error)) {
      if (error instanceof SyntaxError) throw recovery('Identity marker is corrupt.');
      throw error;
    }
    registration = await provisionLinkedWorkspaceIdentity(
      engine.context,
      record.target.workspaceRoot,
      record.target.workspaceId,
      true,
      record.target.instanceId,
    );
  }
  await verifyLinkedWorkspaceIdentity(engine.context, registration);
  return record;
}

export async function requireRegisteredTarget(
  engine: SpecFlowEngine,
  record: CreateJournal,
): Promise<void> {
  const registry = await engine.readRegistry();
  const inspected = await inspectRegisteredWorkspace(
    engine.context,
    registry,
    record.target.workspaceId,
  );
  if (inspected.status !== 'available' || inspected.root !== record.target.workspaceRoot) {
    throw recovery('Existing target checkout moved or became unavailable.');
  }
}

export async function requireTargetIdentity(
  engine: SpecFlowEngine,
  record: CreateJournal,
): Promise<void> {
  if (record.target.kind === 'existing') {
    await requireRegisteredTarget(engine, record);
  } else {
    if (record.stage === 'completed' || (record.commit && isCommitPhase(record.stage))) {
      // After successful create, legitimate agents may advance HEAD. Validate
      // membership and the original branch, but not the provisioning commit.
      // Physical checkout incarnation remains verified below.
      await openVersionControl(engine).worktrees.inspectCreated(
        planFromCreateJournal(engine, record),
      );
      // From the commit stage on HEAD is the base or advanced by the Engine's scaffold commit.
      if (record.stage !== 'completed') await requireCommitLineage(engine, record);
    } else if ((await inspectPlannedGitEffect(engine, record)) !== 'present') {
      // Before terminal completion, exact base HEAD is still critical evidence
      // that this is the worktree produced by the planned Git mutation.
      throw recovery('Git worktree or branch changed since creation.');
    }
    const registration = registrationOf(record);
    await verifyWorkspaceRoot(engine.context, registration.root, registration);
    // A completed Create remains idempotent even if a user later changes
    // the destination checkout's branch; Close will refuse independently.
    if (record.stage !== 'completed') {
      await verifyPinnedIntegrationDestination(engine, record);
    }
  }
}

/** Stages in which the scaffold commit may already exist (only journals that carry `commit`). */
function isCommitPhase(stage: CreateJournal['stage']): boolean {
  return (
    stage === 'commit-writing' ||
    stage === 'commit-written' ||
    stage === 'registry-writing' ||
    stage === 'registry-linked'
  );
}

function recovery(message: string): CreateOperationError {
  return new CreateOperationError('CREATE_RECOVERY_REQUIRED', message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMissing(error: unknown): boolean {
  return isRecord(error) && error.code === 'ENOENT';
}
