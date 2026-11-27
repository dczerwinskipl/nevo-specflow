// Integration (real project, real Git): Close, Abandon and the owner's commits while the one commit
// of a finished agent attempt (D15) waits, pending or failed. The holds of the attempt commits
// (`SpecFlowEngine.attemptCommitHolds`) are the one answer each of them asks: no write, commit or
// archive takes the agent's work away from its attempt commit. Each case runs on a checkout of its
// own, a copy of one initialised template (`../support/agent-attempt-project.ts`).
import { randomUUID } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { expect, it } from 'vitest';

import {
  abandonSpecification,
  closeSpecification,
  closeWorktree,
  createSpecificationForTesting,
  manualCommit,
  openSpecFlowEngine,
  openWorkflow,
  readSpecificationDocumentTree,
  readWorkspaceSpecification,
  retryAgentAttemptCommit,
} from '../../src/testing';
import type { SpecFlowEngine } from '../../src/application';
import { commitExecutionState } from '../../src/specs/documents/execution-state-commit';
import { readLedgerRecord } from '../../src/specs/durable';
import { previewPublicCloseOperation } from '../../src/specs/operations/api';
import {
  agentAttempt,
  agentPaths,
  attemptCommits,
  autoCommitDocuments,
  cleanup,
  commitsSince,
  dirty,
  engine,
  failedAttemptWithDocuments,
  filesOf,
  newSpecification,
  ONE_STEP,
  owner,
  ownerSave,
  ownerWritesOfHeldDocumentsRefused,
  pinIntegrationTarget,
  put,
  retryCommit,
  root,
  siblingSpecId,
  treeDocument,
  useAttemptProject,
  useCheckout,
  type Spec,
} from '../support/agent-attempt-project';
import { commitStaged, git } from '../support/git-project';

useAttemptProject('specflow-attempt-close-');

/** What a refused Close or Abandon must leave as it was: HEAD, the checkout and the agent's files. */
async function untouched(spec: Spec, others: readonly string[] = []) {
  const files = ['src/app.ts', `${spec.directory}/overview.md`, `${spec.directory}/notes.md`];

  return {
    head: git(root, 'rev-parse', 'HEAD'),
    dirty: dirty(),
    files: await Promise.all(files.map((path) => readFile(join(root, path), 'utf8'))),
    locations: await Promise.all(
      [spec.specId, ...others].map(
        async (specId) => (await readWorkspaceSpecification(root, specId)).location,
      ),
    ),
  };
}

/** The refusal of a Close while the attempt commit waits: the attempt named (its `code`) with its paths. */
function waitingCloseRefusal(attemptId: string, code?: string) {
  return {
    code: 'DOCUMENT_COMMITS_PENDING',
    details: {
      cause: 'commit-uncommitted',
      uncommitted: {
        attempts: [
          expect.objectContaining({ attemptId, ...(code !== undefined ? { code } : {}) }) as object,
        ],
      },
    },
  };
}

it('refuses the owner’s writes and manual commits of what a failed attempt commit holds, and Close and Abandon, until Retry commit', async () => {
  await autoCommitDocuments(false);
  await pinIntegrationTarget();
  const spec = await newSpecification('Owner waits to edit');
  await put(`${spec.directory}/other.md`, 'Owner notes.\n');
  git(root, 'add', '-A');
  commitStaged(root, 'other document');
  const head = git(root, 'rev-parse', 'HEAD');
  const agentContent = 'export const app = "agent";\n';
  const attempt = await failedAttemptWithDocuments(spec, agentContent);

  await ownerWritesOfHeldDocumentsRefused(spec, attempt.attemptId);
  // No manual commit takes the agent's work away from its attempt commit, of the Specification or of
  // the whole checkout: only the attempt's own commit takes what it holds.
  const ledger = () =>
    readLedgerRecord(engine.context, engine.workspace.workspaceId, {
      kind: 'specification',
      id: spec.specId,
    });
  const recorded = await ledger();
  for (const scope of ['specification', 'all'] as const) {
    await expect(
      manualCommit(engine, {
        operationId: randomUUID(),
        scope,
        specId: spec.specId,
        message: 'docs: commit everything',
      }),
    ).rejects.toMatchObject({
      code: 'DOCUMENT_COMMITS_PENDING',
      details: {
        cause: 'attempt-commit',
        paths: expect.arrayContaining([`${spec.directory}/overview.md`]) as string[],
      },
      message: expect.stringContaining('requirements#1') as string,
    });
  }

  expect(git(root, 'rev-parse', 'HEAD')).toBe(head);
  expect(await ledger()).toEqual(recorded);

  // The attempt's own Specification cannot end while its commit waits: its exit gate refuses Close.
  // A Close the gate admits meets the agent's files and names the attempt; Abandon waits too.
  const before = await untouched(spec, [siblingSpecId]);
  expect(before.locations).toEqual(['active', 'active']);
  const ownClose = { operationId: randomUUID(), specId: spec.specId };
  await expect(closeSpecification(engine, ownClose)).rejects.toMatchObject({
    code: 'CLOSE_BLOCKED',
    blockers: expect.arrayContaining([
      expect.objectContaining({ kind: 'specification-run' }),
    ]) as object[],
  });
  // The sibling's Close may otherwise archive: never started, nothing unfinished (D07).
  const siblingClose = { operationId: randomUUID(), specId: siblingSpecId };
  await expect(closeSpecification(engine, siblingClose)).rejects.toMatchObject(
    waitingCloseRefusal(attempt.attemptId),
  );
  const abandon = { specId: spec.specId, reason: 'Not needed any more.', actor: owner };
  await expect(abandonSpecification(await openWorkflow(engine), abandon)).rejects.toMatchObject({
    code: 'WORKFLOW_ATTEMPT_COMMIT_REQUIRED',
  });
  // Nothing was archived, committed, written or discarded for the refused operations.
  expect(await untouched(spec, [siblingSpecId])).toEqual(before);
  // Another document of the Specification stays editable.
  expect((await treeDocument(spec, 'other.md')).document.actions.save).toEqual({
    available: true,
  });
  await ownerSave(spec, 'other.md', 'Owner notes, edited.\n');

  // The agent's content again: one Retry commit makes the one attempt commit, without the owner's file.
  await retryCommit(attempt, spec, agentContent);
  const [sha, ...others] = attemptCommits(attempt.attemptId);
  expect(others).toEqual([]);
  const files = filesOf(sha!);
  expect(files).toEqual(expect.arrayContaining(agentPaths(spec)));
  expect(files).not.toContain(`${spec.directory}/other.md`);

  // Now the owner's save of the agent's document is admitted; the owner commits both edits.
  expect((await readSpecificationDocumentTree(engine, spec.specId)).attemptCommit).toBeUndefined();
  await ownerSave(spec, 'overview.md', '# The owner’s edit\n');
  await manualCommit(engine, {
    operationId: randomUUID(),
    scope: 'specification',
    specId: spec.specId,
    message: 'docs: owner edits',
  });
  expect(dirty()).toEqual([]);

  // The same Close and Abandon again apply; the agent's code is in its attempt commit only.
  await expect(closeSpecification(engine, siblingClose)).resolves.toMatchObject({
    status: 'completed',
  });
  await abandonSpecification(await openWorkflow(engine), abandon);
  for (const commit of commitsSince(head).filter((commit) => commit !== sha)) {
    expect(filesOf(commit)).not.toContain('src/app.ts');
  }

  expect(git(root, 'show', 'HEAD:src/app.ts')).toBe(agentContent.trim());
  // Only the Abandon's execution state waits (automatic commits off), for the owner's Close.
  expect(dirty().every((path) => path.startsWith(`${spec.directory}/.execution/`))).toBe(true);
}, 600_000);

it('refuses worktree Close, Abandon and the owner’s commit of the agent’s state from the primary checkout while the attempt commit failed in the worktree, then closes the worktree after Retry commit', async () => {
  await autoCommitDocuments(false);
  await pinIntegrationTarget();
  const primary = root;
  const created = await createSpecificationForTesting(engine, {
    operationId: randomUUID(),
    title: 'Worktree waits',
    created: '2026-11-23',
    archetype: { id: 'feature', version: 1 },
    target: { kind: 'new-worktree', baseRef: 'HEAD' },
  });
  expect(dirname(created.workspaceRoot)).not.toBe(dirname(primary));
  cleanup.push(dirname(created.workspaceRoot));
  // From here on the case's checkout is the Specification's worktree.
  useCheckout(created.workspaceRoot);
  git(root, 'add', '-A');
  commitStaged(root, 'Specification source');
  const branch = git(root, 'symbolic-ref', '--short', 'HEAD');
  const spec: Spec = {
    specId: created.specId,
    archetype: 'feature',
    directory: 'specs/active/' + created.slug,
    subject: { kind: 'specification', specId: created.specId },
  };
  const agentContent = 'export const app = "worktree";\n';
  const attempt = await failedAttemptWithDocuments(spec, agentContent, {
    workspaceId: created.workspaceId,
  });

  const state = async () => ({
    checkout: await untouched(spec),
    primary: git(primary, 'rev-parse', 'HEAD'),
    branch: git(primary, 'rev-parse', branch),
    worktree: (await lstat(root)).isDirectory(),
    binding: (await engine.readRegistry()).specBindings.find(
      (binding) => binding.specId === spec.specId,
    ),
  });
  const before = await state();
  expect(before.binding).toMatchObject({ workspaceId: created.workspaceId });
  expect(before.checkout.dirty).toEqual(expect.arrayContaining(agentPaths(spec)));

  await expect(
    closeWorktree(engine, { operationId: randomUUID(), specId: spec.specId }),
  ).rejects.toMatchObject(waitingCloseRefusal(attempt.attemptId));
  await expect(
    abandonSpecification(await openWorkflow(engine), {
      specId: spec.specId,
      reason: 'Not needed any more.',
      actor: owner,
    }),
  ).rejects.toMatchObject({ code: 'WORKFLOW_ATTEMPT_COMMIT_REQUIRED' });
  // The owner's commit of the execution state, from the Engine opened on the primary checkout, asks
  // the holds of the Specification's own checkout: it takes none of the agent's entries.
  expect(engine.workspace.workspaceId).not.toBe(created.workspaceId);
  expect(await commitExecutionState(engine, spec.specId, { phrase: 'finish' })).toEqual({
    kind: 'nothing-to-commit',
  });
  // No checkout removed, no branch closed or merged, the agent's files as it left them.
  expect(await state()).toEqual(before);

  await retryCommit(attempt, spec, agentContent);
  expect(dirty()).toEqual([]);

  // The agent's work is in its one attempt commit on the worktree's branch, and the whole Close runs
  // now: its reservation, the integration of the branch into the target, the registry and the
  // removal of the worktree.
  const [attemptCommit, ...others] = attemptCommits(attempt.attemptId);
  expect(others).toEqual([]);
  expect(filesOf(attemptCommit!)).toEqual(expect.arrayContaining(agentPaths(spec)));
  expect(git(root, 'show', 'HEAD:src/app.ts')).toBe(agentContent.trim());
  await expect(
    closeWorktree(engine, { operationId: randomUUID(), specId: spec.specId }),
  ).resolves.toMatchObject({ status: 'completed' });
  useCheckout(primary);
  git(primary, 'merge-base', '--is-ancestor', attemptCommit!, 'feature/work');
  expect(git(primary, 'show', 'feature/work:src/app.ts')).toBe(agentContent.trim());
  // A worktree Close integrates the Specification and removes its checkout; it stays active.
  expect((await readWorkspaceSpecification(primary, spec.specId)).location).toBe('active');
  const registry = await engine.readRegistry();
  expect(registry.workspaces.some((entry) => entry.workspaceId === created.workspaceId)).toBe(
    false,
  );
  expect(registry.specBindings.find((binding) => binding.specId === spec.specId)).toMatchObject({
    workspaceId: engine.workspace.workspaceId,
  });
  await expect(lstat(created.workspaceRoot)).rejects.toMatchObject({ code: 'ENOENT' });
  expect(dirty()).toEqual([]);
}, 600_000);

/** Where the last step's Specification lives: the Engine's own checkout, or a worktree of its own. */
type LastStepCheckout = 'primary' | 'worktree';

/** A one-step Specification in `checkout` (a worktree is the case's checkout from here on). */
async function lastStepSpecification(title: string, checkout: LastStepCheckout) {
  if (checkout === 'primary') {
    return { spec: await newSpecification(title, ONE_STEP), workspaceId: undefined };
  }

  const created = await createSpecificationForTesting(engine, {
    operationId: randomUUID(),
    title,
    created: '2026-11-23',
    archetype: { id: ONE_STEP, version: 1 },
    target: { kind: 'new-worktree', baseRef: 'HEAD' },
  });
  cleanup.push(dirname(created.workspaceRoot));
  useCheckout(created.workspaceRoot);
  git(root, 'add', '-A');
  commitStaged(root, 'Specification source');
  const spec: Spec = {
    specId: created.specId,
    archetype: ONE_STEP,
    directory: 'specs/active/' + created.slug,
    subject: { kind: 'specification', specId: created.specId },
  };

  return { spec, workspaceId: created.workspaceId };
}

/**
 * The agent finishes the one step of a one-step Specification, so its run ends and the exit gate
 * admits Close, and its attempt commit waits (`fault`: a crash left it pending, or an outside edit of
 * its declared file, undone again, made it fail): only its execution state is dirty, the state Close
 * otherwise takes into its archive commit. Close (preview and Close: Specification Close in the
 * primary checkout, worktree Close of a Specification in its own worktree) refuses, naming the
 * attempt, before anything is reserved, committed, integrated or removed; after Retry commit the
 * Close runs and the agent's state is in its one attempt commit. `engineOnWorktree` (primary only):
 * an Engine opened on another checkout of the project asks the holds of the Specification's own.
 */
async function lastStepWaitsForAttemptCommit(
  fault: 'pending' | 'failed',
  checkout: LastStepCheckout,
  engineOnWorktree?: () => Promise<SpecFlowEngine>,
): Promise<void> {
  const primary = root;
  const { spec, workspaceId } = await lastStepSpecification(
    `Last step ${fault} ${checkout}`,
    checkout,
  );
  const head = git(root, 'rev-parse', 'HEAD');
  const agentContent = `export const app = "${fault}";\n`;
  const attempt = await agentAttempt(spec, {
    step: 'write',
    archetype: 'spec-writer',
    ...(workspaceId !== undefined ? { workspaceId } : {}),
    ...(fault === 'failed' ? { declared: ['src/app.ts'] } : {}),
    work: () => (fault === 'failed' ? put('src/app.ts', agentContent) : Promise.resolve()),
    faults: async (boundary) => {
      if (boundary !== 'post-actions-pending') {
        return;
      }

      if (fault === 'pending') {
        throw new Error('Crash at post-actions-pending.');
      }

      // The committed content again: the declared file is no longer the agent's, nor dirty.
      await put('src/app.ts', git(root, 'show', 'HEAD:src/app.ts') + '\n');
    },
  });
  if (fault === 'pending') {
    await expect(attempt.finalize(attempt.faulty)).rejects.toThrow(
      'Crash at post-actions-pending.',
    );
  } else {
    expect(await attempt.finalize(attempt.faulty)).toMatchObject({
      kind: 'finished',
      postActions: [{ action: 'attempt-commit', status: 'failed', code: 'MANUAL_COMMIT_CONFLICT' }],
    });
  }

  const state = async () => ({
    head: git(root, 'rev-parse', 'HEAD'),
    primary: git(primary, 'rev-parse', 'HEAD'),
    dirty: dirty(),
    location: (await readWorkspaceSpecification(root, spec.specId)).location,
    checkout: (await lstat(root)).isDirectory(),
    binding: (await engine.readRegistry()).specBindings.find(
      (binding) => binding.specId === spec.specId,
    ),
  });
  const before = await state();
  expect(before.head).toBe(head);
  expect(before.location).toBe('active');
  expect(before.dirty.length).toBeGreaterThan(0);
  expect(before.dirty.every((path) => path.startsWith(`${spec.directory}/.execution/`))).toBe(true);

  const refusal = waitingCloseRefusal(
    attempt.attemptId,
    fault === 'pending' ? 'ATTEMPT_COMMIT_PENDING' : 'MANUAL_COMMIT_CONFLICT',
  );
  const close = { operationId: randomUUID(), specId: spec.specId };
  const kind = checkout === 'primary' ? 'specification-close' : 'worktree-close';
  const runClose = () =>
    checkout === 'primary' ? closeSpecification(engine, close) : closeWorktree(engine, close);
  await expect(previewPublicCloseOperation(engine, { kind, ...close })).rejects.toMatchObject(
    refusal,
  );
  await expect(runClose()).rejects.toMatchObject(refusal);
  if (engineOnWorktree !== undefined) {
    // Keyed by the Specification's checkout, not the Engine's: its Close preview names the attempt
    // and the owner's commit of the execution state takes none of the agent's entries.
    const other = await engineOnWorktree();
    expect(other.workspace.workspaceId).not.toBe(engine.workspace.workspaceId);
    await expect(previewPublicCloseOperation(other, { kind, ...close })).rejects.toMatchObject(
      refusal,
    );
    expect(await commitExecutionState(other, spec.specId, { phrase: 'finish' })).toEqual({
      kind: 'nothing-to-commit',
    });
  }

  // Nothing reserved, archived, committed, integrated or removed: the state stays the attempt's.
  expect(await state()).toEqual(before);

  if (fault === 'failed') {
    await put('src/app.ts', agentContent);
  }

  const [retried] = (
    await retryAgentAttemptCommit(attempt.agent, {
      subject: spec.subject,
      step: 'write',
      attempt: 1,
      actor: owner,
    })
  ).postActions;
  expect(retried).toMatchObject({ action: 'attempt-commit', status: 'completed' });
  const [attemptCommit, ...others] = attemptCommits(attempt.attemptId);
  expect(others).toEqual([]);
  expect(filesOf(attemptCommit!)).toEqual(expect.arrayContaining(before.dirty));

  await expect(runClose()).resolves.toMatchObject({ status: 'completed' });
  if (checkout === 'primary') {
    expect((await readWorkspaceSpecification(root, spec.specId)).location).toBe('archive');
    expect(dirty()).toEqual([]);

    return;
  }

  // The worktree Close integrated the branch with the attempt commit and removed the worktree.
  const worktree = root;
  useCheckout(primary);
  git(primary, 'merge-base', '--is-ancestor', attemptCommit!, 'feature/work');
  const registry = await engine.readRegistry();
  expect(registry.workspaces.some((entry) => entry.workspaceId === workspaceId)).toBe(false);
  await expect(lstat(worktree)).rejects.toMatchObject({ code: 'ENOENT' });
  expect(dirty()).toEqual([]);
}

it('refuses Close of a Specification whose last step an agent finished until its pending or failed attempt commit ran', async () => {
  await autoCommitDocuments(false);
  await pinIntegrationTarget();
  // An Engine opened on a worktree of the project (another Specification's) asks the same holds.
  const onWorktree = async () => {
    const created = await createSpecificationForTesting(engine, {
      operationId: randomUUID(),
      title: 'Other worktree',
      created: '2026-11-23',
      archetype: { id: 'minimal', version: 1 },
      target: { kind: 'new-worktree', baseRef: 'HEAD' },
    });
    cleanup.push(dirname(created.workspaceRoot));

    return openSpecFlowEngine({ cwd: created.workspaceRoot });
  };

  await lastStepWaitsForAttemptCommit('pending', 'primary', onWorktree);
  await lastStepWaitsForAttemptCommit('failed', 'primary');
}, 600_000);

it('refuses worktree Close of a Specification whose last step an agent finished in its worktree until its pending or failed attempt commit ran', async () => {
  await autoCommitDocuments(false);
  await pinIntegrationTarget();
  await lastStepWaitsForAttemptCommit('pending', 'worktree');
  await lastStepWaitsForAttemptCommit('failed', 'worktree');
}, 600_000);
