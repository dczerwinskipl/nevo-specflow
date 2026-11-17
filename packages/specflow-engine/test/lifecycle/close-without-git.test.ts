import { randomUUID } from 'node:crypto';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import { previewPublicCloseOperation } from '../../src';
import {
  bootstrapProjectHome,
  closeSpecification,
  createSpecificationForTesting,
  inspectCloseOperation,
} from '../../src/testing';
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

describe('Specification Close with Git off', () => {
  it('archives in place without a commit or repository precondition', async () => {
    const { root, engine, spec, head } = await fixture();
    const operationId = randomUUID();

    const preview = await previewPublicCloseOperation(engine, {
      kind: 'specification-close',
      operationId,
      specId: spec.specId,
    });
    expect(preview).toMatchObject({
      integrationRequired: false,
      sourceWorkspace: { kind: 'primary' },
      merge: { status: 'not-integrated', reason: 'git-off' },
    });

    const closed = await closeSpecification(engine, { operationId, specId: spec.specId });
    expect(closed).toMatchObject({
      status: 'completed',
      journal: { stage: 'completed', outcome: 'archived-without-git', plan: { gitOff: true } },
    });
    const manifest = parse(
      await readFile(join(root, 'specs/archive', spec.slug, 'specification.yaml'), 'utf8'),
    ) as { status: string };
    expect(manifest.status).toBe('archived');
    expect(git(root, 'rev-parse', 'HEAD')).toBe(head);
    // The journal round-trips its codec, and a retry replays the completed operation.
    expect(await inspectCloseOperation(engine, operationId)).toEqual(closed.journal);
    expect(await closeSpecification(engine, { operationId, specId: spec.specId })).toEqual(closed);
  }, 60000);

  it('keeps the workflow gate and refuses an explicit integration', async () => {
    const { engine, spec } = await fixture();
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
  }, 60000);
});
