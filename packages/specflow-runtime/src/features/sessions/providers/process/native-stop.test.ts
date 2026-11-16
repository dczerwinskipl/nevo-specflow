import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  captureProcessIdentity,
  nativeStopEvidence,
  systemProcessInspection,
  type ProcessInspection,
} from './native-stop';
import { parseProcessIdentity, type NativeProcessIdentity } from './process-identity';

const bootA = randomUUID();

function inspection(overrides: Partial<ProcessInspection>): ProcessInspection {
  return {
    windows: false,
    posixGroup: () => 'present',
    linuxBootId: () => bootA,
    linuxStart: () => '100',
    windowsCreation: () => '42',
    windowsRoot: () => 'present',
    windowsJob: () => 'active',
    ...overrides,
  };
}

const posix: NativeProcessIdentity = {
  platform: 'posix',
  groupId: 4242,
  bootId: bootA,
  leaderStart: '100',
};
const job = 'Local\\NevoSession-' + randomUUID();
const windows: NativeProcessIdentity = { platform: 'windows', pid: 4242, createdAt: '42', job };

describe('native-stop evidence', () => {
  it.each([
    ['an empty group', { posixGroup: () => 'absent' as const }, 'stopped'],
    ['another boot', { linuxBootId: () => randomUUID() }, 'stopped'],
    ['a leader PID reused by a later process', { linuxStart: () => '999' }, 'stopped'],
    ['the same leader', {}, 'running'],
    ['a live group whose leader exited', { linuxStart: () => undefined }, 'running'],
    ['a group that cannot be probed', { posixGroup: () => 'unknown' as const }, 'unknown'],
  ])('POSIX: %s', (_name, overrides: Partial<ProcessInspection>, expected) => {
    expect(nativeStopEvidence(posix, inspection(overrides))).toBe(expected);
  });

  it('never treats a live POSIX group without a recorded start time as stopped', () => {
    expect(nativeStopEvidence({ platform: 'posix', groupId: 4242 }, inspection({}))).toBe(
      'unknown',
    );
  });

  it.each([
    ['root and job gone', 'gone', 'gone', 'stopped'],
    ['root gone, job empty', 'gone', 'empty', 'stopped'],
    ['root alive', 'present', 'gone', 'running'],
    ['job members alive', 'gone', 'active', 'running'],
    ['root unknown', 'unknown', 'gone', 'unknown'],
    ['job unknown', 'gone', 'unknown', 'unknown'],
  ] as const)('Windows: %s', (_name, root, jobState, expected) => {
    expect(
      nativeStopEvidence(
        windows,
        inspection({ windows: true, windowsRoot: () => root, windowsJob: () => jobState }),
      ),
    ).toBe(expected);
  });

  it('never applies one platform family identity on the other', () => {
    expect(nativeStopEvidence(windows, inspection({ posixGroup: () => 'absent' }))).toBe('unknown');
    expect(nativeStopEvidence(posix, inspection({ windows: true }))).toBe('unknown');
  });

  it('treats a failing OS query as unknown', () => {
    const throwing = inspection({
      posixGroup: () => {
        throw new Error('query failed');
      },
    });
    expect(nativeStopEvidence(posix, throwing)).toBe('unknown');
  });

  it('round-trips only a well-formed recorded identity', () => {
    expect(parseProcessIdentity(posix)).toEqual(posix);
    expect(parseProcessIdentity(windows)).toEqual(windows);
    expect(parseProcessIdentity({ ...posix, groupId: 0 })).toBeUndefined();
    expect(parseProcessIdentity({ ...windows, job: 'Global\\Other' })).toBeUndefined();
    expect(parseProcessIdentity({ ...windows, extra: 1 })).toBeUndefined();
  });

  it('sees a real process stop on this OS', async () => {
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      detached: process.platform !== 'win32',
      stdio: 'ignore',
    });
    await once(child, 'spawn');
    const identity = captureProcessIdentity(
      child.pid!,
      process.platform === 'win32' ? job : undefined,
    )!;
    expect(parseProcessIdentity(identity)).toEqual(identity);
    try {
      expect(nativeStopEvidence(identity, systemProcessInspection)).toBe(
        process.platform === 'linux' || process.platform === 'win32' ? 'running' : 'unknown',
      );
    } finally {
      const exited = once(child, 'exit');
      child.kill('SIGKILL');
      await exited;
    }

    expect(nativeStopEvidence(identity, systemProcessInspection)).toBe('stopped');
  });
});
