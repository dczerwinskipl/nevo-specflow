import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { LOCAL_CONFIG_RELATIVE_PATH } from '../git-checkout';
import {
  LOCAL_CONFIG_COPY_RECORD_RELATIVE_PATH,
  copyLocalConfigIntoWorktree,
  inspectLocalConfigCopy,
} from './local-config-copy';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

async function checkouts(homeConfig?: string) {
  const base = await realpath(await mkdtemp(join(tmpdir(), 'local-config-copy-')));
  roots.push(base);
  const home = join(base, 'home');
  const worktree = join(base, 'worktree');
  await mkdir(join(home, '.nevo/local'), { recursive: true });
  await mkdir(join(worktree, '.nevo/local/state'), { recursive: true });
  if (homeConfig !== undefined) {
    await writeFile(join(home, LOCAL_CONFIG_RELATIVE_PATH), homeConfig);
  }

  return { home, worktree, config: join(worktree, LOCAL_CONFIG_RELATIVE_PATH) };
}

describe('local configuration copy record', () => {
  it('copies and records the bytes; a re-run keeps both consistent', async () => {
    const { home, worktree, config } = await checkouts('ai: {}\n');
    await copyLocalConfigIntoWorktree(home, worktree);
    const record = await readFile(join(worktree, LOCAL_CONFIG_COPY_RECORD_RELATIVE_PATH), 'utf8');
    expect(await inspectLocalConfigCopy(worktree)).toBe('unchanged');
    expect((await readdir(join(worktree, '.nevo/local'))).sort()).toEqual(['config.yaml', 'state']);

    await writeFile(join(home, LOCAL_CONFIG_RELATIVE_PATH), 'ai: { home: changed }\n');
    await copyLocalConfigIntoWorktree(home, worktree);
    expect(await readFile(config, 'utf8')).toBe('ai: {}\n');
    expect(await readFile(join(worktree, LOCAL_CONFIG_COPY_RECORD_RELATIVE_PATH), 'utf8')).toBe(
      record,
    );
  });

  it('classifies an edited copy, an unrecorded config and an absent config', async () => {
    const { home, worktree, config } = await checkouts('ai: {}\n');
    expect(await inspectLocalConfigCopy(worktree)).toBe('absent');
    await writeFile(config, 'ai: {}\n');
    expect(await inspectLocalConfigCopy(worktree)).toBe('unrecorded');
    // A configuration the user created first is never adopted or overwritten.
    await copyLocalConfigIntoWorktree(home, worktree);
    expect(await inspectLocalConfigCopy(worktree)).toBe('unrecorded');

    const other = await checkouts('ai: {}\n');
    await copyLocalConfigIntoWorktree(other.home, other.worktree);
    await writeFile(other.config, 'ai: { edited: true }\n');
    expect(await inspectLocalConfigCopy(other.worktree)).toBe('changed');
  });

  it('recovers an interrupted copy: removes a leftover stage file and rewrites a stale record', async () => {
    const { home, worktree, config } = await checkouts('ai: { home: current }\n');
    // A crash after the record and mid-copy, with Project Home edited before the retry.
    await writeFile(
      join(worktree, LOCAL_CONFIG_COPY_RECORD_RELATIVE_PATH),
      JSON.stringify({ version: 1, sha256: 'a'.repeat(64) }),
    );
    await writeFile(join(worktree, '.nevo/local/.config.yaml.create-copy.tmp'), 'ai: { trun');
    await copyLocalConfigIntoWorktree(home, worktree);
    expect(await readFile(config, 'utf8')).toBe('ai: { home: current }\n');
    expect(await inspectLocalConfigCopy(worktree)).toBe('unchanged');
    expect((await readdir(join(worktree, '.nevo/local'))).sort()).toEqual(['config.yaml', 'state']);
  });

  it('reports a corrupt record as unreadable', async () => {
    const { worktree, config } = await checkouts();
    await writeFile(join(worktree, LOCAL_CONFIG_COPY_RECORD_RELATIVE_PATH), '{"version":1');
    await writeFile(config, 'ai: {}\n');
    expect(await inspectLocalConfigCopy(worktree)).toBe('unreadable');
  });
});
