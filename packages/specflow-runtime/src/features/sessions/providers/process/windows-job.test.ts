import { expect, it, vi } from 'vitest';
import { settleWindowsJob } from './windows-job';

it('allows Job accounting to catch up after root exit without inventing forced termination', async () => {
  let count = 1;
  const terminate = vi.fn(() => false);
  queueMicrotask(() => {
    count = 0;
  });
  await expect(
    settleWindowsJob({ rootExited: true, active: () => count, terminate }),
  ).resolves.toEqual({ state: 'stopped', reason: 'group-exited' });
  expect(terminate).not.toHaveBeenCalled();
});

it('terminates surviving descendants after root exit and requires positive zero accounting', async () => {
  let count = 1;
  const terminate = vi.fn(() => {
    count = 0;

    return true;
  });
  await expect(
    settleWindowsJob({ rootExited: true, active: () => count, terminate }),
  ).resolves.toEqual({ state: 'stopped', reason: 'tree-killed' });
  expect(terminate).toHaveBeenCalledOnce();
});

it('does not wait for natural exit when cancelling a still-running root', async () => {
  let count = 1;
  const terminate = vi.fn(() => {
    count = 0;

    return true;
  });
  const result = settleWindowsJob({ rootExited: false, active: () => count, terminate });
  expect(terminate).toHaveBeenCalledOnce();
  await expect(result).resolves.toEqual({ state: 'stopped', reason: 'tree-killed' });
});

it.each([1, undefined])(
  'never treats root exit as proof of tree settlement (accounting: %s)',
  async (count) => {
    await expect(
      settleWindowsJob({ rootExited: true, active: () => count, terminate: () => false }),
    ).resolves.toEqual({ state: 'unknown', reason: 'unverified-tree' });
  },
);
