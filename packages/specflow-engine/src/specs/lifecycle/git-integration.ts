import type { SpecFlowEngine } from '../../application';
import { GitCapabilityError } from '../../git/errors';
import { executeGit } from '../../git/process';
import { inspectRegisteredWorkspace } from '../../project/workspace-registry';
import {
  inspectGitIntegrationEvidence,
  type GitIntegrationEvidence,
} from '../../version-control/git/integration';
import { readProjectGitPolicy } from '../../version-control/worktrees/config';
import { inspectCleanGitWorkspace } from './preflight';
import { readCloseJournal } from './journal-store';
import { CloseOperationError, type CloseWorkspaceEvidence } from './model';

export interface GitIntegrationInspection extends GitIntegrationEvidence {
  readonly operationId: string;
  readonly projectConfigChanged: boolean;
}

function conflict(message: string): CloseOperationError {
  return new CloseOperationError('CLOSE_CONFLICT', message);
}

/** Lifecycle owns the durable intent, Project Home and checkout identity. */
export async function inspectCloseGitIntegration(
  engine: SpecFlowEngine,
  operationId: string,
): Promise<GitIntegrationInspection> {
  const journal = await readCloseJournal(engine.context, operationId);
  if (!journal) throw conflict('Close operation is not reserved.');
  if (
    journal.stage !== 'reserved' &&
    journal.stage !== 'integration-preparation-initiated' &&
    journal.stage !== 'integration-scratch-candidate' &&
    journal.stage !== 'integration-scratch-conflict' &&
    journal.stage !== 'archive-committed'
  ) {
    throw conflict('Integration inspection requires a mutation-free reservation stage.');
  }
  const plan = journal.plan;
  if (!plan.target || !plan.targetBranch) {
    throw new CloseOperationError(
      'CLOSE_INVALID',
      'This Close operation does not include Git target integration.',
    );
  }
  if (plan.source.workspaceId === plan.target.workspaceId) {
    throw new CloseOperationError(
      'CLOSE_INVALID',
      'Direct primary archival does not use linked Git integration.',
    );
  }

  const registry = await engine.readRegistry();
  if (registry.revision !== plan.registryRevision) {
    throw conflict('Workspace registry changed after Close reservation.');
  }
  if (plan.configRevision) {
    const policy = await readProjectGitPolicy(engine.context);
    if (
      policy.revision !== plan.configRevision ||
      policy.policy.integrationTargetBranch !== plan.targetBranch
    ) {
      throw conflict('Git integration policy changed after Close reservation.');
    }
  } else {
    const source = registry.workspaces.find((item) => item.workspaceId === plan.source.workspaceId);
    const pinned = source?.kind === 'linked' ? source.integrationDestination : undefined;
    if (
      pinned?.workspaceId !== plan.target.workspaceId ||
      pinned?.instanceId !== plan.target.instanceId ||
      pinned?.branch !== plan.targetBranch
    ) {
      throw conflict('Pinned workspace integration destination changed since Close admission.');
    }
  }

  const inspectPinned = async (expected: CloseWorkspaceEvidence): Promise<void> => {
    const registered = registry.workspaces.find(
      (item) => item.workspaceId === expected.workspaceId,
    );
    if (registered?.root !== expected.root || registered?.instanceId !== expected.instanceId) {
      throw conflict('Pinned Git workspace registration changed.');
    }
    const observed = await inspectRegisteredWorkspace(
      engine.context,
      registry,
      expected.workspaceId,
    );
    if (observed.status !== 'available' || observed.root !== expected.root) {
      throw conflict('Pinned Git checkout is missing or was replaced.');
    }
    const facts = await inspectCleanGitWorkspace(registered);
    const expectedHead =
      journal.archive && expected.workspaceId === plan.source.workspaceId
        ? journal.archive.committedHead
        : expected.head;
    if (facts.branch !== expected.branch || facts.head !== expectedHead) {
      throw conflict('Pinned Git branch or HEAD changed before integration.');
    }
  };

  await inspectPinned(plan.source);
  await inspectPinned(plan.target);
  if (plan.target.branch !== plan.targetBranch) {
    throw conflict('Destination checkout is not on its pinned integration branch.');
  }

  let gitProof: GitIntegrationEvidence;
  try {
    gitProof = await inspectGitIntegrationEvidence({
      root: plan.target.root,
      sourceCommit: journal.archive?.committedHead ?? plan.source.head,
      targetCommit: plan.target.head,
    });
  } catch (error) {
    if (error instanceof GitCapabilityError) throw conflict(error.message);
    throw error;
  }

  // An exclusive managed Spec Close integrates the COMPLETE source branch,
  // including ordinary code changes. However, it must not silently publish
  // committed edits to ANOTHER canonical Specification. Compare the source
  // against its merge base, not source against target: target-only Spec edits
  // belong to primary and must not be mistaken for source contamination.
  const sourcePaths = await executeGit(plan.target.root, [
    'diff',
    '--no-ext-diff',
    '--no-renames',
    '--name-only',
    '-z',
    gitProof.mergeBaseCommit,
    gitProof.sourceCommit,
  ]);
  if (sourcePaths.exitCode !== 0) {
    throw conflict('Cannot prove Specification ownership of source branch changes.');
  }
  const ownedSlugs = (plan.occupants ?? [{ slug: plan.slug }]).map((x) => x.slug);
  const foreignSpecPath = sourcePaths.stdout
    .split('\0')
    .filter(Boolean)
    .find(
      (path) =>
        path.startsWith('specs/') &&
        !ownedSlugs.some(
          (slug) =>
            path.startsWith('specs/active/' + slug + '/') ||
            path.startsWith('specs/archive/' + slug + '/'),
        ),
    );
  if (foreignSpecPath) {
    throw new CloseOperationError(
      'CLOSE_PREFLIGHT',
      'Source branch changes another Specification: ' + foreignSpecPath,
    );
  }

  // No read-only proof grants mutation authority; pinned identities are
  // rechecked after the Git probes and before returning the evidence.
  await inspectPinned(plan.source);
  await inspectPinned(plan.target);
  return {
    ...gitProof,
    operationId,
    projectConfigChanged: gitProof.changedPaths.includes('.nevo/config.yaml'),
  };
}
