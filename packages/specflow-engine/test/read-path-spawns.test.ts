import { subscribe, unsubscribe } from 'node:diagnostics_channel';
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';

import { afterEach, describe, expect, it } from 'vitest';

import { readCanonicalSpecSources } from '../src/specs/canonical-source';
import { inspectCreateOptions } from '../src/specs/create/inspect/options';
import { bootstrapProjectHome, createSpecificationForTesting } from '../src/testing';
import { createGitTestProject, git } from './support/git-project';

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
      archetype: { id: 'minimal', version: 1 },
      target: { kind: 'new-worktree', baseRef: 'HEAD' },
    });
    const commits = [
      git(root, 'rev-parse', 'HEAD'),
      git(linked.workspaceRoot, 'rev-parse', 'HEAD'),
    ];

    const first = await countGit(() => inspectCreateOptions(engine));
    const second = await countGit(() => inspectCreateOptions(engine));
    const overview = await countGit(() => readCanonicalSpecSources(engine));

    // Filesystem verification adds no processes. Inherent facts use two lists, one status per
    // workspace, one resolution per branch and default, and one ls-tree/show per unique commit.
    expect(first.result.workspaces).toHaveLength(2);
    expect(first.result.baseRefs).toHaveLength(2);
    expect(new Set(commits).size).toBe(2);
    const expectedProcesses =
      2 + first.result.workspaces.length + first.result.baseRefs.length + 1 + 2 * commits.length;
    for (const snapshot of [first, second]) {
      expect(snapshot.spawns).toHaveLength(expectedProcesses);
      const treeReads = snapshot.spawns.filter((args) => args[0] === 'ls-tree');
      const configReads = snapshot.spawns.filter((args) => args[0] === 'show');
      expect(treeReads.map((args) => args[2]).sort()).toEqual([...commits].sort());
      expect(configReads.map((args) => args[1]).sort()).toEqual(
        commits.map((commit) => commit + ':.nevo/config.yaml').sort(),
      );
    }

    expect(overview.spawns).toEqual([]);
    expect(first.result.workspaces.find((w) => w.workspaceId === linked.workspaceId)).toBeDefined();
  }, 240000);
});
