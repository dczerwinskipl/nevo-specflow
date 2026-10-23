import { subscribe, unsubscribe } from 'node:diagnostics_channel';
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';

import { afterEach, describe, expect, it } from 'vitest';

import { readCanonicalSpecSources } from '../src/specs/canonical-source';
import { inspectCreateOptions } from '../src/specs/create/inspect/options';
import { bootstrapProjectHome, createSpecificationForTesting } from '../src/testing';
import { createGitTestProject } from './support/git-project';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 })),
  );
});

async function countGit<T>(work: () => Promise<T>): Promise<{ result: T; spawns: string[][] }> {
  const spawns: string[][] = [];
  const listener = (message: unknown): void => {
    spawns.push([...(message as { args: readonly string[] }).args]);
  };
  subscribe('nevo.specflow.engine.git-process', listener);
  try {
    return { result: await work(), spawns };
  } finally {
    unsubscribe('nevo.specflow.engine.git-process', listener);
  }
}

describe('read-path Git process budget (per request)', () => {
  it('reads spawn no Git verification; create-options only runs inherent Git facts', async () => {
    const root = await createGitTestProject(
      'specflow-read-spawns-',
      'runtime: {}\ngit:\n  enabled: true\n',
    );
    roots.push(root, root + '-worktrees');
    const engine = await bootstrapProjectHome(root);
    const linked = await createSpecificationForTesting(engine, {
      operationId: randomUUID(),
      title: 'Linked',
      created: '2026-10-20',
      target: { kind: 'new-worktree', baseRef: 'HEAD' },
    });

    const first = await countGit(() => inspectCreateOptions(engine));
    const second = await countGit(() => inspectCreateOptions(engine));
    const overview = await countGit(() => readCanonicalSpecSources(engine));

    // Reads verify with the filesystem only: worktree list + for-each-ref + 1 status per
    // attached workspace (2 here). Overview/workspace/document reads spawn nothing.
    expect(first.spawns.length).toBeLessThanOrEqual(8);
    expect(second.spawns.length).toBe(first.spawns.length);
    expect(overview.spawns).toEqual([]);
    expect(first.result.workspaces.find((w) => w.workspaceId === linked.workspaceId)).toBeDefined();
  }, 240000);
});
