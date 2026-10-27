import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { projectControlLockPath } from './control-lock';
import {
  CONTROL_LOCK_CORRUPT_MIN_AGE_MS,
  takeOverProjectControlLock,
  type ProcessProbe,
} from './control-lock-takeover';
import type { ResolvedProjectHome } from './home/home';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fakeHome(): ResolvedProjectHome {
  const stateRoot = mkdtempSync(join(tmpdir(), 'control-lock-takeover-'));
  roots.push(stateRoot);
  mkdirSync(join(stateRoot, 'engine'));
  return { project: { stateRoot, projectId: 'project-1' } } as unknown as ResolvedProjectHome;
}

const TOKEN = '11111111-2222-4333-8444-555555555555';

function writeLock(home: ResolvedProjectHome, pid: number, createdAt: string): void {
  writeFileSync(
    projectControlLockPath(home),
    JSON.stringify({ version: 1, projectId: 'project-1', token: TOKEN, pid, createdAt }) + '\n',
  );
}

const NOW = Date.parse('2026-10-27T12:00:00.000Z');
const common = { nowMs: () => NOW, pid: 100, processStartedAtMs: NOW - 3_600_000 };
const probeOf = (state: ProcessProbe) => (): ProcessProbe => state;

describe('operator takeover of the Project Home control lock', () => {
  it('does nothing when the lock is free', async () => {
    const home = fakeHome();
    expect(
      await takeOverProjectControlLock(home, { ...common, confirmExecutorStopped: true }),
    ).toEqual({ status: 'free' });
  });

  it('touches nothing without the operator assertion', async () => {
    const home = fakeHome();
    writeLock(home, 200, new Date(NOW - 1000).toISOString());
    const result = await takeOverProjectControlLock(home, {
      ...common,
      confirmExecutorStopped: false,
      probe: probeOf('dead'),
    });
    expect(result).toEqual({ status: 'refused', reason: 'assertion-missing' });
    expect(existsSync(projectControlLockPath(home))).toBe(true);
  });

  it('never clears a lock whose holder is alive, not even on the assertion', async () => {
    const home = fakeHome();
    writeLock(home, 200, new Date(NOW - 1000).toISOString());
    const result = await takeOverProjectControlLock(home, {
      ...common,
      confirmExecutorStopped: true,
      probe: probeOf('alive'),
    });
    expect(result).toEqual({ status: 'refused', reason: 'holder-alive' });
    expect(existsSync(projectControlLockPath(home))).toBe(true);
  });

  it('refuses when it cannot tell whether the holder runs', async () => {
    const home = fakeHome();
    writeLock(home, 200, new Date(NOW - 1000).toISOString());
    expect(
      await takeOverProjectControlLock(home, {
        ...common,
        confirmExecutorStopped: true,
        probe: probeOf('unknown'),
      }),
    ).toEqual({ status: 'refused', reason: 'holder-unknown' });
  });

  it('clears the lock of a holder that is gone', async () => {
    const home = fakeHome();
    const createdAt = new Date(NOW - 1000).toISOString();
    writeLock(home, 200, createdAt);
    const result = await takeOverProjectControlLock(home, {
      ...common,
      confirmExecutorStopped: true,
      probe: probeOf('dead'),
    });
    expect(result).toEqual({ status: 'cleared', holder: { pid: 200, createdAt } });
    expect(existsSync(projectControlLockPath(home))).toBe(false);
  });

  it('refuses a lock that this process wrote after it started (a sibling thread may hold it)', async () => {
    const home = fakeHome();
    writeLock(home, 100, new Date(NOW - 1000).toISOString());
    expect(
      await takeOverProjectControlLock(home, {
        ...common,
        confirmExecutorStopped: true,
        probe: probeOf('dead'),
      }),
    ).toEqual({ status: 'refused', reason: 'holder-is-this-process' });
  });

  it('clears a lock with the PID of this process that is older than the process (a restarted container)', async () => {
    const home = fakeHome();
    writeLock(home, 100, new Date(NOW - 7_200_000).toISOString());
    const result = await takeOverProjectControlLock(home, {
      ...common,
      confirmExecutorStopped: true,
    });
    expect(result.status).toBe('cleared');
  });

  it('clears unreadable metadata only once the file is old enough, and never a directory', async () => {
    const home = fakeHome();
    writeFileSync(projectControlLockPath(home), '{"version":1,');
    const young = await takeOverProjectControlLock(home, {
      ...common,
      confirmExecutorStopped: true,
      modifiedAtMs: () => Promise.resolve(NOW - 1000),
    });
    expect(young).toEqual({ status: 'refused', reason: 'corrupt-too-recent' });
    const old = await takeOverProjectControlLock(home, {
      ...common,
      confirmExecutorStopped: true,
      modifiedAtMs: () => Promise.resolve(NOW - CONTROL_LOCK_CORRUPT_MIN_AGE_MS),
    });
    expect(old).toEqual({ status: 'cleared', holder: 'unreadable' });

    const other = fakeHome();
    mkdirSync(projectControlLockPath(other));
    expect(
      await takeOverProjectControlLock(other, {
        ...common,
        confirmExecutorStopped: true,
        modifiedAtMs: () => Promise.resolve(0),
      }),
    ).toEqual({ status: 'refused', reason: 'not-a-regular-file' });
    expect(existsSync(projectControlLockPath(other))).toBe(true);
  });

  it('leaves a lock alone that changed hands while it was judged', async () => {
    const home = fakeHome();
    writeLock(home, 200, new Date(NOW - 1000).toISOString());
    const result = await takeOverProjectControlLock(home, {
      ...common,
      confirmExecutorStopped: true,
      probe: () => {
        // The holder released the lock and another process took it.
        writeLock(home, 300, new Date(NOW).toISOString());
        return 'dead';
      },
    });
    expect(result).toEqual({ status: 'refused', reason: 'changed' });
    expect(existsSync(projectControlLockPath(home))).toBe(true);
  });
});
