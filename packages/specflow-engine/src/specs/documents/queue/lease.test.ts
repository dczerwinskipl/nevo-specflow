import { describe, expect, it } from 'vitest';

import type { ExecutorIdentity } from '../changes/journal';
import type { ProcessTable } from '../write/executor-identity';
import { judgeExecutor } from './lease';

const own: ExecutorIdentity = {
  pid: 100,
  hostId: 'host',
  platform: 'linux',
  pidNamespaceId: 'pid:[1]',
  processStartTime: '500',
  bootId: 'boot',
};

/** A process table with an injected `/proc`: pid -> start time. */
function table(procs: Record<number, string>): ProcessTable {
  return {
    pid: 100,
    platform: 'linux',
    hostId: () => 'host',
    readText: (path) => {
      const match = /^\/proc\/(\d+)\/stat$/u.exec(path);
      const start = match ? procs[Number(match[1])] : undefined;

      return Promise.resolve(
        start === undefined ? undefined : '1 (name) S ' + '0 '.repeat(18) + start + ' 0',
      );
    },
    readLink: () => Promise.resolve(undefined),
  };
}

describe('judging the executor of a lease', () => {
  it('takes over a provably dead executor (the PID is gone)', async () => {
    const verdict = await judgeExecutor({ ...own, pid: 200 }, own, {
      activeInProcess: false,
      table: table({}),
    });
    expect(verdict).toEqual({ kind: 'takeover', proof: 'dead' });
  });

  it('never takes over a live executor, not even on an assertion', async () => {
    const live = table({ 200: '500' });
    const recorded = { ...own, pid: 200 };
    expect(await judgeExecutor(recorded, own, { activeInProcess: false, table: live })).toEqual({
      kind: 'held',
      state: 'alive',
    });
    expect(
      await judgeExecutor(recorded, own, {
        activeInProcess: false,
        confirmStopped: true,
        table: live,
      }),
    ).toEqual({ kind: 'held', state: 'alive' });
  });

  it('takes over a PID reused with another start time', async () => {
    const verdict = await judgeExecutor({ ...own, pid: 200 }, own, {
      activeInProcess: false,
      table: table({ 200: '999' }),
    });
    expect(verdict).toEqual({ kind: 'takeover', proof: 'dead' });
  });

  it('holds an unprovable executor unless an operator asserts it stopped', async () => {
    const elsewhere = { ...own, hostId: 'other-host' };
    const options = { activeInProcess: false, table: table({}) };
    expect(await judgeExecutor(elsewhere, own, options)).toEqual({
      kind: 'held',
      state: 'unknown',
    });
    expect(await judgeExecutor(elsewhere, own, { ...options, confirmStopped: true })).toEqual({
      kind: 'takeover',
      proof: 'asserted',
    });
  });

  it('this very process: idle takes over, active holds', async () => {
    const idle = await judgeExecutor(own, own, { activeInProcess: false, table: table({}) });
    expect(idle).toEqual({ kind: 'takeover', proof: 'self' });
    const busy = await judgeExecutor(own, own, { activeInProcess: true, table: table({}) });
    expect(busy).toEqual({ kind: 'held', state: 'self' });
  });
});
