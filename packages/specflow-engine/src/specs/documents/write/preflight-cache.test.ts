import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { ResolvedProjectHome } from '../../../project/home/home';
import {
  GitPreflightCache,
  preflightKey,
  readPreflightSignature,
  PREFLIGHT_CACHE_TTL_MS,
} from './preflight-cache';

describe('GitPreflightCache', () => {
  it('serves an entry only while it is young and its signature token holds', () => {
    let now = 0;
    const cache = new GitPreflightCache({ now: () => now });
    const key = preflightKey('/repo', 'main', ['b.md', 'a.md']);
    expect(cache.has(key, 't1')).toBe(false);
    cache.remember(key, 't1');
    expect(cache.has(key, 't1')).toBe(true);
    expect(cache.has(key, 't2')).toBe(false);
    cache.remember(key, 't1');
    now = PREFLIGHT_CACHE_TTL_MS - 1;
    expect(cache.has(key, 't1')).toBe(true);
    now = PREFLIGHT_CACHE_TTL_MS;
    expect(cache.has(key, 't1')).toBe(false);
  });

  it('never lives longer than the 2 s of the decision, whatever is asked for', () => {
    let now = 0;
    const cache = new GitPreflightCache({ ttlMs: 60_000, now: () => now });
    cache.remember('k', 't');
    now = 2000;
    expect(cache.has('k', 't')).toBe(false);
  });

  it('keys by checkout, branch ref and the SET of paths (order does not matter)', () => {
    const base = preflightKey('/repo', 'main', ['a.md', 'b.md']);
    expect(preflightKey('/repo', 'main', ['b.md', 'a.md'])).toBe(base);
    expect(preflightKey('/repo', 'main', ['a.md'])).not.toBe(base);
    expect(preflightKey('/repo', 'other', ['a.md', 'b.md'])).not.toBe(base);
    expect(preflightKey('/repo2', 'main', ['a.md', 'b.md'])).not.toBe(base);
  });

  it('forgets the oldest entry beyond its size', () => {
    const cache = new GitPreflightCache({ maxEntries: 2, now: () => 0 });
    cache.remember('1', 't');
    cache.remember('2', 't');
    cache.remember('3', 't');
    expect(cache.has('1', 't')).toBe(false);
    expect(cache.has('2', 't')).toBe(true);
    expect(cache.has('3', 't')).toBe(true);
  });
});

describe('readPreflightSignature', () => {
  const roots: string[] = [];
  afterEach(async () => {
    await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
  });

  async function checkout() {
    const base = await mkdtemp(join(tmpdir(), 'preflight-signature-'));
    roots.push(base);
    const root = join(base, 'checkout');
    const home = join(base, 'home');
    await mkdir(join(root, '.git'), { recursive: true });
    await mkdir(home, { recursive: true });
    await writeFile(join(root, '.git', 'HEAD'), 'ref: refs/heads/feature/work\n');
    await writeFile(join(home, 'config.yaml'), 'git: {}\n');
    const context = {
      project: {
        projectConfigPath: join(home, 'config.yaml'),
        localConfigPath: join(home, 'local.yaml'),
      },
    } as unknown as ResolvedProjectHome;
    return { root, home, context };
  }

  it('reads the branch from HEAD and holds while nothing it covers changes', async () => {
    const { root, context } = await checkout();
    const first = await readPreflightSignature(context, root);
    expect(first.branchRef).toBe('feature/work');
    expect(first.indexLocked).toBe(false);
    expect((await readPreflightSignature(context, root)).token).toBe(first.token);
  });

  it('changes when HEAD moves to another branch or is detached', async () => {
    const { root, context } = await checkout();
    const before = await readPreflightSignature(context, root);
    await writeFile(join(root, '.git', 'HEAD'), 'ref: refs/heads/other\n');
    const moved = await readPreflightSignature(context, root);
    expect(moved.branchRef).toBe('other');
    expect(moved.token).not.toBe(before.token);
    await writeFile(join(root, '.git', 'HEAD'), 'a'.repeat(40) + '\n');
    const detached = await readPreflightSignature(context, root);
    expect(detached.branchRef).toBeUndefined();
    expect(detached.token).not.toBe(moved.token);
  });

  it('changes when the index lock appears and when either configuration file changes', async () => {
    const { root, home, context } = await checkout();
    const before = await readPreflightSignature(context, root);
    await writeFile(join(root, '.git', 'index.lock'), '');
    const locked = await readPreflightSignature(context, root);
    expect(locked.indexLocked).toBe(true);
    await rm(join(root, '.git', 'index.lock'));

    const stamp = new Date(Date.now() + 5000);
    await utimes(join(home, 'config.yaml'), stamp, stamp);
    const touched = await readPreflightSignature(context, root);
    expect(touched.token).not.toBe(before.token);

    await writeFile(join(home, 'local.yaml'), 'git: {}\n');
    expect((await readPreflightSignature(context, root)).token).not.toBe(touched.token);
  });

  it('follows the gitdir file of a linked checkout', async () => {
    const base = await mkdtemp(join(tmpdir(), 'preflight-linked-'));
    roots.push(base);
    const gitDirectory = join(base, 'admin');
    const root = join(base, 'linked');
    await mkdir(gitDirectory, { recursive: true });
    await mkdir(root, { recursive: true });
    await writeFile(join(gitDirectory, 'HEAD'), 'ref: refs/heads/linked-branch\n');
    await writeFile(join(root, '.git'), 'gitdir: ' + gitDirectory + '\n');
    const context = {
      project: { projectConfigPath: join(base, 'a'), localConfigPath: join(base, 'b') },
    } as unknown as ResolvedProjectHome;
    expect((await readPreflightSignature(context, root)).branchRef).toBe('linked-branch');
    await writeFile(join(gitDirectory, 'index.lock'), '');
    expect((await readPreflightSignature(context, root)).indexLocked).toBe(true);
  });

  it('never lets an unreadable checkout be served from the cache', async () => {
    const { context } = await checkout();
    const one = await readPreflightSignature(context, join(tmpdir(), 'preflight-no-such-checkout'));
    const two = await readPreflightSignature(context, join(tmpdir(), 'preflight-no-such-checkout'));
    expect(one.indexLocked).toBe(true);
    expect(one.token).not.toBe(two.token);
  });
});
