import { EventEmitter } from 'node:events';

import { describe, expect, it, vi } from 'vitest';

import { onGitProcessEnd, terminateGitProcessTree } from '../../src/git/process-shared';

function fakeChild(pid: number | undefined) {
  return { pid, kill: vi.fn(() => true) };
}

describe('terminateGitProcessTree', () => {
  it('signals the whole process group on POSIX', () => {
    const child = fakeChild(4242);
    const signalGroup = vi.fn();
    terminateGitProcessTree(child, 'SIGTERM', { platform: 'linux', signalGroup });
    expect(signalGroup).toHaveBeenCalledWith(4242, 'SIGTERM');
    expect(child.kill).not.toHaveBeenCalled();
  });

  it('falls back to killing git itself when the group cannot be signalled', () => {
    const child = fakeChild(4242);
    terminateGitProcessTree(child, 'SIGKILL', {
      platform: 'darwin',
      signalGroup: () => {
        throw new Error('ESRCH');
      },
    });
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
  });

  it('kills the tree with taskkill on Windows and also the child itself', () => {
    const child = fakeChild(77);
    const taskkill = vi.fn();
    const signalGroup = vi.fn();
    terminateGitProcessTree(child, 'SIGTERM', { platform: 'win32', taskkill, signalGroup });
    expect(taskkill).toHaveBeenCalledWith(77);
    expect(signalGroup).not.toHaveBeenCalled();
    expect(child.kill).toHaveBeenCalled();
  });

  it('does not signal a process group after its leader exited (the id may have been reused)', () => {
    const child = { ...fakeChild(4242), exitCode: 0 };
    const signalGroup = vi.fn();
    terminateGitProcessTree(child, 'SIGKILL', { platform: 'linux', signalGroup });
    expect(signalGroup).not.toHaveBeenCalled();
    expect(child.kill).not.toHaveBeenCalled();
    const killed = { ...fakeChild(4242), exitCode: null, signalCode: 'SIGTERM' as const };
    terminateGitProcessTree(killed, 'SIGKILL', { platform: 'linux', signalGroup });
    expect(signalGroup).not.toHaveBeenCalled();
  });

  it('sweeps the group of an exited leader only when asked to (the exit handler of a mutation)', () => {
    const child = { ...fakeChild(4242), exitCode: 1 };
    const signalGroup = vi.fn();
    terminateGitProcessTree(child, 'SIGKILL', { platform: 'linux', signalGroup, sweep: true });
    expect(signalGroup).toHaveBeenCalledWith(4242, 'SIGKILL');
  });

  it('kills a child without a pid directly', () => {
    const child = fakeChild(undefined);
    terminateGitProcessTree(child, 'SIGKILL', { platform: 'linux', signalGroup: vi.fn() });
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
  });
});

describe('onGitProcessEnd', () => {
  it('reports the code once on close', () => {
    const child = Object.assign(new EventEmitter(), { stdout: null, stderr: null });
    const done = vi.fn();
    onGitProcessEnd(child, 50, done);
    child.emit('exit', 0);
    child.emit('close', 0);
    expect(done).toHaveBeenCalledTimes(1);
    expect(done).toHaveBeenCalledWith(0);
  });

  it('settles on exit when close never fires (a grandchild holds the pipes) and closes the streams', async () => {
    const stdout = { destroy: vi.fn() };
    const stderr = { destroy: vi.fn() };
    const child = Object.assign(new EventEmitter(), { stdout, stderr });
    const done = vi.fn();
    onGitProcessEnd(child, 20, done);
    child.emit('exit', 3);
    expect(done).not.toHaveBeenCalled();
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(done).toHaveBeenCalledTimes(1);
    expect(done).toHaveBeenCalledWith(3);
    expect(stdout.destroy).toHaveBeenCalled();
    expect(stderr.destroy).toHaveBeenCalled();
    child.emit('close', 3);
    expect(done).toHaveBeenCalledTimes(1);
  });
});
