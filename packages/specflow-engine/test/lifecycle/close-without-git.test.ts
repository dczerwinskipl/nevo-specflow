import { randomUUID } from 'node:crypto';
import { access, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import { previewPublicCloseOperation } from '../../src';
import {
  bootstrapProjectHome,
  closeSpecification,
  createSpecificationForTesting,
  finishCloseWithoutGit,
  inspectCloseOperation,
  inspectCloseWithoutGit,
  previewCloseOperation,
  reserveCloseOperation,
  resumeCloseWithoutGit,
} from '../../src/testing';
import { isCloseJournal } from '../../src/specs/lifecycle/journal/codec';
import type { SpecificationExitBlocker } from '../../src/specs/lifecycle';
import { createGitTestProject, git } from '../support/git-project';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0).reverse()) {
    await rm(root, { recursive: true, force: true, maxRetries: 6, retryDelay: 250 });
  }
});

/** A project without a `git:` block (Git off) with one uncommitted Specification in the primary. */
async function fixture() {
  const root = await createGitTestProject('close-without-git-', 'runtime: {}\n');
  roots.push(root);
  const engine = await bootstrapProjectHome(root);
  const spec = await createSpecificationForTesting(engine, {
    operationId: randomUUID(),
    title: 'Archive without Git',
    created: '2026-11-17',
    archetype: { id: 'minimal', version: 1 },
    target: { kind: 'existing', workspaceId: engine.workspace.workspaceId },
  });
  // Unrelated dirty files are no Close precondition with Git off.
  await writeFile(join(root, 'scratch.txt'), 'not committed\n');

  return { root, engine, spec, head: git(root, 'rev-parse', 'HEAD') };
}

/** The archived manifest (its read fails when it is not in `specs/archive`). */
const archivedManifest = async (root: string, slug: string) =>
  parse(await readFile(join(root, 'specs/archive', slug, 'specification.yaml'), 'utf8')) as Record<
    string,
    unknown
  >;

describe('Specification Close with Git off', () => {
  it('archives in place without a commit, and the codec accepts only its exact journal', async () => {
    const { root, engine, spec, head } = await fixture();
    const operationId = randomUUID();

    const preview = await previewPublicCloseOperation(engine, {
      kind: 'specification-close',
      operationId,
      specId: spec.specId,
    });
    expect(preview).toMatchObject({
      integrationRequired: false,
      merge: { status: 'not-integrated', reason: 'git-off', checkout: 'primary' },
    });

    const closed = await closeSpecification(engine, { operationId, specId: spec.specId });
    expect(closed).toMatchObject({
      status: 'completed',
      journal: { stage: 'completed', outcome: 'archived-without-git', plan: { gitOff: true } },
    });
    expect(await archivedManifest(root, spec.slug)).not.toHaveProperty('status');
    expect(git(root, 'rev-parse', 'HEAD')).toBe(head);
    expect(await inspectCloseOperation(engine, operationId)).toEqual(closed.journal);
    expect(await closeSpecification(engine, { operationId, specId: spec.specId })).toEqual(closed);

    const journal = closed.journal;
    const move = journal.archiveMove!;
    const forged: readonly [string, unknown][] = [
      ['Git archive evidence', { ...journal, archive: { ...move, sourceCommit: head } }],
      ['Git outcome', { ...journal, outcome: 'archived-in-primary' }],
      [
        'integration flag in the primary',
        { ...journal, plan: { ...journal.plan, integrateToTargetBranch: false } },
      ],
      ['archive move on a Git plan', { ...journal, plan: { ...journal.plan, gitOff: undefined } }],
      ['unknown move key', { ...journal, archiveMove: { ...move, committedHead: head } }],
      [
        'unknown file key',
        {
          ...journal,
          archiveMove: {
            ...move,
            files: [{ ...move.files[0]!, mode: 'x' }, ...move.files.slice(1)],
          },
        },
      ],
      [
        'branch on the checkout',
        {
          ...journal,
          plan: { ...journal.plan, source: { ...journal.plan.source, branch: 'main' } },
        },
      ],
    ];
    for (const [label, value] of forged) {
      expect(isCloseJournal(engine.context, value, operationId), label).toBe(false);
    }
  }, 120000);

  it('keeps the workflow gate, refuses integration and worktree Close, and fails closed on an unreadable policy', async () => {
    const { root, engine, spec } = await fixture();
    const blocker: SpecificationExitBlocker = {
      kind: 'unfinished-tasks',
      subjectIds: ['task-1'],
      message: 'A Task is not finished.',
    };
    const blocked = { ...engine, specificationExit: () => Promise.resolve([blocker]) };

    await expect(
      closeSpecification(blocked, { operationId: randomUUID(), specId: spec.specId }),
    ).rejects.toMatchObject({ code: 'CLOSE_BLOCKED', blockers: [blocker] });
    await expect(
      closeSpecification(engine, {
        operationId: randomUUID(),
        specId: spec.specId,
        integrateToTargetBranch: true,
      }),
    ).rejects.toMatchObject({ code: 'CLOSE_INVALID' });
    await expect(
      previewCloseOperation(blocked, { kind: 'worktree-close', specId: spec.specId }),
    ).rejects.toMatchObject({
      code: 'CLOSE_INVALID',
      message: expect.stringContaining('archive the Specification instead') as unknown,
    });

    // An unreadable policy never defaults to Git: the gate first (D07), then the policy error.
    await writeFile(join(root, '.nevo/config.yaml'), 'runtime: {}\ngit:\n  enabled: maybe\n');
    await expect(
      previewCloseOperation(blocked, { kind: 'specification-close', specId: spec.specId }),
    ).rejects.toMatchObject({ code: 'CLOSE_BLOCKED' });
    await expect(
      previewCloseOperation(engine, { kind: 'specification-close', specId: spec.specId }),
    ).rejects.toMatchObject({ code: 'GIT_POLICY_INVALID' });
  }, 120000);

  it('refuses a policy change between preview and lock, and recovers an interrupted move by operator', async () => {
    const { root, engine, spec } = await fixture();
    const config = join(root, '.nevo/config.yaml');

    await expect(
      reserveCloseOperation(
        engine,
        { kind: 'specification-close', operationId: randomUUID(), specId: spec.specId },
        { hooks: { afterFlush: () => writeFile(config, 'runtime: {}\ngit:\n  enabled: true\n') } },
      ),
    ).rejects.toMatchObject({ code: 'CLOSE_CONFLICT' });
    await writeFile(config, 'runtime: {}\n');

    const operationId = randomUUID();
    const { journal } = await reserveCloseOperation(engine, {
      kind: 'specification-close',
      operationId,
      specId: spec.specId,
    });
    await expect(
      finishCloseWithoutGit(engine, journal, {
        afterArchiveMove: () => Promise.reject(new Error('crash after the rename')),
      }),
    ).rejects.toThrow('crash after the rename');
    const stuck = (await inspectCloseOperation(engine, operationId))!;
    expect(stuck.stage).toBe('archive-initiated');

    // A retry never re-runs the move.
    await expect(
      closeSpecification(engine, { operationId, specId: spec.specId }),
    ).rejects.toMatchObject({ code: 'CLOSE_RECOVERY_REQUIRED' });
    expect(await inspectCloseWithoutGit(engine, operationId)).toEqual({
      stage: 'archive-initiated',
      move: 'moved-original-manifest',
    });

    const resumed = await resumeCloseWithoutGit(engine, operationId, true);
    expect(resumed).toMatchObject({ stage: 'completed', outcome: 'archived-without-git' });
    expect(await archivedManifest(root, spec.slug)).not.toHaveProperty('status');
  }, 120000);

  it('archives a linked Specification created while Git was on in its worktree, uncommitted', async () => {
    const root = await createGitTestProject(
      'close-without-git-linked-',
      'runtime: {}\ngit:\n  enabled: true\n',
    );
    roots.push(root);
    const engine = await bootstrapProjectHome(root);
    const spec = await createSpecificationForTesting(engine, {
      operationId: randomUUID(),
      title: 'Linked then Git off',
      created: '2026-11-17',
      archetype: { id: 'minimal', version: 1 },
      target: { kind: 'new-worktree', baseRef: 'HEAD' },
    });
    roots.push(dirname(spec.workspaceRoot));
    const head = git(spec.workspaceRoot, 'rev-parse', 'HEAD');
    await writeFile(join(root, '.nevo/config.yaml'), 'runtime: {}\ngit:\n  enabled: false\n');

    const operationId = randomUUID();
    expect(
      await previewPublicCloseOperation(engine, {
        kind: 'specification-close',
        operationId,
        specId: spec.specId,
      }),
    ).toMatchObject({ merge: { status: 'not-integrated', reason: 'git-off', checkout: 'linked' } });
    const closed = await closeSpecification(engine, { operationId, specId: spec.specId });
    expect(closed.journal).toMatchObject({
      outcome: 'archived-without-git',
      plan: { gitOff: true, integrateToTargetBranch: false },
    });
    expect(await archivedManifest(spec.workspaceRoot, spec.slug)).not.toHaveProperty('status');
    expect(git(spec.workspaceRoot, 'rev-parse', 'HEAD')).toBe(head);
    await access(spec.workspaceRoot);
    expect((await engine.readRegistry()).specBindings).toContainEqual(
      expect.objectContaining({
        specId: spec.specId,
        workspaceId: closed.journal.plan.source.workspaceId,
      }),
    );
  }, 300000);
});
