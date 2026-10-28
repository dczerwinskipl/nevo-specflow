import { describe, expect, it } from 'vitest';

import {
  captureExecutorIdentity,
  processStartTimeOf,
  proveExecutorState,
  type ProcessTable,
} from './executor-identity';

const STAT_FIELDS_AFTER_COMM = (start: string): string =>
  // state, then fields 4 to 21 (18 numbers), then field 22.
  ['S', ...Array.from({ length: 18 }, () => '0'), start, '0', '0'].join(' ');

function stat(pid: number, comm: string, start: string): string {
  return `${pid} (${comm}) ${STAT_FIELDS_AFTER_COMM(start)}`;
}

function table(options: {
  pid: number;
  host?: string;
  files?: Record<string, string>;
  links?: Record<string, string>;
  threadId?: number;
}): ProcessTable {
  return {
    pid: options.pid,
    hostId: () => options.host ?? 'host-1',
    readText: (path) => Promise.resolve(options.files?.[path]),
    readLink: (path) => Promise.resolve(options.links?.[path]),
    threadId: options.threadId ?? 0,
  };
}

const LINUX = {
  files: {
    '/proc/self/stat': stat(100, 'node', '5000'),
    '/proc/sys/kernel/random/boot_id': 'boot-a\n',
  },
  links: { '/proc/self/ns/pid': 'pid:[4026531836]' },
};

describe('processStartTimeOf', () => {
  it('counts the fields after the last parenthesis, whatever the command name holds', () => {
    expect(processStartTimeOf(stat(7, 'a b) (c', '987'))).toBe('987');
    expect(processStartTimeOf('garbage')).toBeUndefined();
    expect(processStartTimeOf('1 (x) S 1 2')).toBeUndefined();
  });
});

describe('captureExecutorIdentity', () => {
  it('records the namespace, start time and boot id where procfs supplies them', async () => {
    expect(await captureExecutorIdentity(table({ pid: 100, ...LINUX }))).toEqual({
      pid: 100,
      hostId: 'host-1',
      platform: process.platform,
      threadId: 0,
      pidNamespaceId: 'pid:[4026531836]',
      processStartTime: '5000',
      bootId: 'boot-a',
    });
  });

  it('records only the PID and the host where there is no procfs', async () => {
    expect(await captureExecutorIdentity(table({ pid: 42 }))).toEqual({
      pid: 42,
      hostId: 'host-1',
      platform: process.platform,
      threadId: 0,
    });
  });
});

describe('proveExecutorState', () => {
  const own = {
    pid: 100,
    hostId: 'host-1',
    pidNamespaceId: 'pid:[4026531836]',
    processStartTime: '5000',
    bootId: 'boot-a',
  };
  const procs = table({
    pid: 100,
    files: { ...LINUX.files, '/proc/200/stat': stat(200, 'other', '6000') },
    links: LINUX.links,
  });

  it('records the worker thread of a process that runs more than one', async () => {
    expect(
      (await captureExecutorIdentity(table({ pid: 100, threadId: 3, ...LINUX }))).threadId,
    ).toBe(3);
  });

  it('never takes over another thread of the same process: only an operator can', async () => {
    expect(await proveExecutorState({ ...own, threadId: 3 }, { ...own, threadId: 0 }, procs)).toBe(
      'unknown',
    );
    // A record from before threads were recorded counts as the main thread.
    expect(await proveExecutorState(own, { ...own, threadId: 2 }, procs)).toBe('unknown');
    expect(await proveExecutorState({ ...own, threadId: 2 }, { ...own, threadId: 2 }, procs)).toBe(
      'self',
    );
    // Another process is judged by the process alone.
    expect(await proveExecutorState({ ...own, pid: 300, threadId: 5 }, own, procs)).toBe('dead');
  });

  it('knows its own record', async () => {
    expect(await proveExecutorState(own, own, procs)).toBe('self');
  });

  it('proves a record dead when the PID is gone, has another start time or another boot', async () => {
    expect(await proveExecutorState({ ...own, pid: 300 }, own, procs)).toBe('dead');
    expect(await proveExecutorState({ ...own, pid: 200, processStartTime: '1' }, own, procs)).toBe(
      'dead',
    );
    expect(await proveExecutorState({ ...own, bootId: 'boot-b' }, own, procs)).toBe('dead');
    expect(await proveExecutorState({ ...own, processStartTime: '1' }, own, procs)).toBe('dead');
  });

  it('never takes over a PID that runs with the recorded start time', async () => {
    expect(
      await proveExecutorState({ ...own, pid: 200, processStartTime: '6000' }, own, procs),
    ).toBe('alive');
  });

  it('proves nothing across platforms or when only one side has a PID namespace', async () => {
    // A Windows process and a WSL one over the same files can share host name and PID numbers.
    const windows = { pid: 100, hostId: 'host-1', platform: 'win32' };
    const wsl = { ...own, platform: 'linux' };
    expect(await proveExecutorState(windows, wsl, procs)).toBe('unknown');
    expect(await proveExecutorState(wsl, windows, procs)).toBe('unknown');
    expect(await proveExecutorState({ ...windows, platform: 'linux' }, wsl, procs)).toBe('unknown');
    expect(
      await proveExecutorState(
        { ...own, platform: 'linux' },
        { ...own, platform: 'darwin' },
        procs,
      ),
    ).toBe('unknown');
    // The same platform and the same PID without procfs stays this very process.
    expect(await proveExecutorState(windows, { ...windows }, table({ pid: 100 }))).toBe('self');
  });

  it('cannot prove anything on another host, in another namespace or without procfs', async () => {
    expect(await proveExecutorState({ ...own, hostId: 'host-2', pid: 300 }, own, procs)).toBe(
      'unknown',
    );
    expect(
      await proveExecutorState({ ...own, pidNamespaceId: 'pid:[1]', pid: 300 }, own, procs),
    ).toBe('unknown');
    const bare = { pid: 7, hostId: 'host-1' };
    expect(await proveExecutorState(bare, bare, table({ pid: 7 }))).toBe('self');
    expect(await proveExecutorState({ ...bare, pid: 8 }, own, procs)).toBe('unknown');
    expect(
      await proveExecutorState({ ...own, pid: 200, processStartTime: undefined }, own, procs),
    ).toBe('unknown');
  });
});
