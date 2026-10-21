import { subscribe, unsubscribe } from 'node:diagnostics_channel';
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';

import { afterEach, describe, expect, it } from 'vitest';

import { readCanonicalSpecSources } from '../src/specs/canonical-source';
import { inspectCreateOptions } from '../src/specs/create-options';
import { bootstrapProjectHome, createSpecificationForTesting } from '../src/testing';
import { createGitTestProject } from './support/git-project';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
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
  it('verifies each workspace once per request and again on every new request', async () => {
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

    // Baseline before the per-request memo: 55 (create-options) and 37 (overview).
    expect(first.spawns.length).toBeLessThanOrEqual(22);
    // Nothing is cached across requests: full verification runs again.
    expect(second.spawns.length).toBeGreaterThanOrEqual(10);
    expect(overview.spawns.length).toBeLessThanOrEqual(16);
    expect(first.result.workspaces.find((w) => w.workspaceId === linked.workspaceId)).toBeDefined();
  }, 240000);
});
