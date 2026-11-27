import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { projectControlLockPath, releaseAbandonedProjectControlLock } from './control-lock';
import type { ResolvedProjectHome } from './home/home';
import type { ExecutorIdentity, ProcessTable } from '../specs/durable/executor-identity';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function fakeHome(): ResolvedProjectHome {
  const stateRoot = mkdtempSync(join(tmpdir(), 'control-lock-abandoned-'));
  roots.push(stateRoot);
  mkdirSync(join(stateRoot, 'engine'));

  return { project: { stateRoot, projectId: 'project-1' } } as unknown as ResolvedProjectHome;
}

const TOKEN = '11111111-2222-4333-8444-555555555555';
const CREATED_AT = '2026-11-27T04:39:15.525Z';

/** This process as the Runtime on Windows sees itself (no procfs; the creation time from the OS). */
const own: ExecutorIdentity = {
  pid: 100,
  hostId: 'host-1',
  platform: 'win32',
  threadId: 0,
  processStartTime: '133000000000000000',
};

function writeLock(home: ResolvedProjectHome, pid: number, owner?: ExecutorIdentity): void {
  writeFileSync(
    projectControlLockPath(home),
    JSON.stringify({
      version: 1,
      projectId: 'project-1',
      token: TOKEN,
      pid,
      createdAt: CREATED_AT,
      ...(owner ? { owner } : {}),
    }) + '\n',
  );
}

/** The OS as the test wants it: whether a PID runs, and with which creation time. */
function os(processes: Record<number, string | undefined>): ProcessTable {
  return {
    pid: own.pid,
    hostId: () => own.hostId,
    readText: () => Promise.resolve(undefined),
    readLink: () => Promise.resolve(undefined),
    probe: (pid) => (pid in processes ? 'alive' : 'dead'),
    startTimeOf: (pid) => processes[pid],
  };
}

const holder = (pid: number, start: string): ExecutorIdentity => ({
  ...own,
  pid,
  processStartTime: start,
});

describe('release of an abandoned control lock (positive evidence only)', () => {
  it('releases a lock whose holder PID is not running', async () => {
    const home = fakeHome();
    writeLock(home, 1184488, holder(1184488, '1'));
    expect(await releaseAbandonedProjectControlLock(home, { own, table: os({}) })).toEqual({
      status: 'released',
      holder: { pid: 1184488, createdAt: CREATED_AT },
    });
    expect(existsSync(projectControlLockPath(home))).toBe(false);
  });

  it('keeps a lock written before owners were recorded, even when its PID is not running here', async () => {
    const home = fakeHome();
    // Nothing says it came from this host and platform: WSL or a container over the same files
    // reads as "no such process" from Windows.
    writeLock(home, 1184488);
    expect(await releaseAbandonedProjectControlLock(home, { own, table: os({}) })).toEqual({
      status: 'kept',
      reason: 'holder-unknown',
    });
    expect(existsSync(projectControlLockPath(home))).toBe(true);
  });

  it('never releases a lock whose holder runs', async () => {
    const home = fakeHome();
    writeLock(home, 200, holder(200, '5'));
    expect(
      await releaseAbandonedProjectControlLock(home, { own, table: os({ 200: '5' }) }),
    ).toEqual({ status: 'kept', reason: 'holder-alive' });
    expect(existsSync(projectControlLockPath(home))).toBe(true);
  });

  it('releases a lock whose PID now belongs to a process created at another time', async () => {
    const home = fakeHome();
    writeLock(home, 200, holder(200, '5'));
    expect(
      await releaseAbandonedProjectControlLock(home, { own, table: os({ 200: '9' }) }),
    ).toMatchObject({ status: 'released' });
  });

  it('keeps a lock whose live PID cannot be told apart from a reused one', async () => {
    const home = fakeHome();
    // The creation time of the live PID cannot be read: it may be the holder.
    writeLock(home, 200, holder(200, '5'));
    expect(
      await releaseAbandonedProjectControlLock(home, { own, table: os({ 200: undefined }) }),
    ).toEqual({ status: 'kept', reason: 'holder-unknown' });
    // A lock without an owner: only the PID is known, which proves nothing either way.
    writeLock(home, 300);
    expect(
      await releaseAbandonedProjectControlLock(home, { own, table: os({ 300: '1' }) }),
    ).toEqual({ status: 'kept', reason: 'holder-unknown' });
    expect(existsSync(projectControlLockPath(home))).toBe(true);
  });

  it('keeps a lock of another host or platform, and unreadable metadata', async () => {
    const home = fakeHome();
    writeLock(home, 200, { ...holder(200, '5'), hostId: 'host-2' });
    expect(await releaseAbandonedProjectControlLock(home, { own, table: os({}) })).toEqual({
      status: 'kept',
      reason: 'holder-unknown',
    });
    writeLock(home, 200, { ...holder(200, '5'), platform: 'linux' });
    expect(await releaseAbandonedProjectControlLock(home, { own, table: os({}) })).toEqual({
      status: 'kept',
      reason: 'holder-unknown',
    });
    writeFileSync(projectControlLockPath(home), '');
    expect(await releaseAbandonedProjectControlLock(home, { own, table: os({}) })).toEqual({
      status: 'kept',
      reason: 'corrupt',
    });
  });

  it('releases a leftover of an earlier process that had this PID, never this process own lock', async () => {
    const home = fakeHome();
    writeLock(home, own.pid, holder(own.pid, '1'));
    expect(
      await releaseAbandonedProjectControlLock(home, {
        own,
        table: os({ [own.pid]: own.processStartTime }),
      }),
    ).toMatchObject({ status: 'released' });
    // Without an owner the own PID proves nothing.
    writeLock(home, own.pid);
    expect(
      await releaseAbandonedProjectControlLock(home, {
        own,
        table: os({ [own.pid]: own.processStartTime }),
      }),
    ).toEqual({ status: 'kept', reason: 'holder-unknown' });
  });

  it('answers free for a missing lock', async () => {
    expect(await releaseAbandonedProjectControlLock(fakeHome(), { own, table: os({}) })).toEqual({
      status: 'free',
    });
  });
});
