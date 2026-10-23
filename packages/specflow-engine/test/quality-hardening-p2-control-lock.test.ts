import { randomUUID } from 'node:crypto';
import { channel } from 'node:diagnostics_channel';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { bootstrapProjectHome, resolveProjectHome, withProjectControlLock } from '../src/testing';
import {
  assertProjectHomeLockProof,
  captureProjectHomeLockProof,
} from '../src/project/home/lock-proof';
import { PROJECT_HOME_MARKER_RELATIVE_PATH } from '../src/project/home/home';
import { GIT_INSTANCE_SENTINEL_FILE } from '../src/project/git-instance';
import { createGitTestProject, git } from './support/git-project';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0).reverse()) {
    await rm(root, { recursive: true, force: true, maxRetries: 6, retryDelay: 250 });
  }
});

async function fixture() {
  const root = await createGitTestProject(
    'specflow-control-lock-p2-Ż ',
    'runtime: {}\ngit:\n  enabled: true\n',
  );
  roots.push(root);
  const engine = await bootstrapProjectHome(root);
  return { root, context: engine.context };
}

describe('P2 Project Home lock filesystem-only post-acquisition proof', () => {
  it('admits an unchanged physical Project Home and retains the control-lock CAS boundary', async () => {
    const { context } = await fixture();
    const proof = await captureProjectHomeLockProof(context);
    await expect(assertProjectHomeLockProof(context, proof)).resolves.toBeUndefined();
    const run = () => Promise.resolve('writer-admitted');
    const admitted = await withProjectControlLock(context, run);
    expect(admitted).toBe('writer-admitted');
  });

  it('spawns Git only before entering the control lock', async () => {
    const { root, context } = await fixture();
    const gitProcessChannel = channel('nevo.specflow.engine.git-process');
    let spawns = 0;
    const observe = () => {
      spawns++;
    };
    gitProcessChannel.subscribe(observe);
    try {
      await resolveProjectHome({ cwd: root, projectRoot: root });
      const oneVerification = spawns;
      expect(oneVerification).toBeGreaterThan(0);
      spawns = 0;
      await withProjectControlLock(context, () => {
        expect(spawns).toBe(oneVerification);
        return Promise.resolve();
      });
      expect(spawns).toBe(oneVerification);
    } finally {
      gitProcessChannel.unsubscribe(observe);
    }
  });

  it('rejects changed home marker and physical Git instance with the pinned proof', async () => {
    const { root, context } = await fixture();
    const proof = await captureProjectHomeLockProof(context);
    const markerPath = join(root, PROJECT_HOME_MARKER_RELATIVE_PATH);
    const markerBytes = await readFile(markerPath, 'utf8');
    try {
      const marker = JSON.parse(markerBytes) as Record<string, unknown>;
      await writeFile(markerPath, JSON.stringify({ ...marker, projectId: randomUUID() }));
      await expect(assertProjectHomeLockProof(context, proof)).rejects.toThrow();
    } finally {
      await writeFile(markerPath, markerBytes);
    }
    const gitInstancePath = join(context.project.gitCommonDir, GIT_INSTANCE_SENTINEL_FILE);
    const instanceBytes = await readFile(gitInstancePath, 'utf8');
    try {
      const instance = JSON.parse(instanceBytes) as Record<string, unknown>;
      await writeFile(gitInstancePath, JSON.stringify({ ...instance, instanceId: randomUUID() }));
      await expect(assertProjectHomeLockProof(context, proof)).rejects.toThrow();
    } finally {
      await writeFile(gitInstancePath, instanceBytes);
    }
    await expect(assertProjectHomeLockProof(context, proof)).resolves.toBeUndefined();
  });

  it('detects changed Git worktree membership without invoking Git inside the lock', async () => {
    const { root, context } = await fixture();
    const proof = await captureProjectHomeLockProof(context);
    const linked = join(dirname(root), 'specflow-p2-new-worktree-' + randomUUID());
    roots.push(linked);
    git(root, 'worktree', 'add', '-q', '--detach', linked, 'HEAD');
    await expect(assertProjectHomeLockProof(context, proof)).rejects.toThrow(
      /physical|worktree|authority/iu,
    );
    // The new checkout is a valid member, but is not automatically a new home.
    const linkedContext = await resolveProjectHome({ cwd: linked, projectRoot: root });
    const result = await withProjectControlLock(linkedContext, () => Promise.resolve('linked'));
    expect(result).toBe('linked');
  });
});
