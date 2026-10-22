// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCreateLeaveGuard } from './useCreateLeaveGuard';

interface BlockerOptions {
  shouldBlockFn: () => boolean | Promise<boolean>;
  enableBeforeUnload: boolean;
}
let blocker: BlockerOptions;
vi.mock('@tanstack/react-router', () => ({
  useBlocker: (options: BlockerOptions) => {
    blocker = options;
  },
}));

afterEach(cleanup);

const guard = (options: { unfinished?: boolean; dirty?: boolean; allowed?: boolean }) =>
  renderHook(() =>
    useCreateLeaveGuard({
      unfinished: options.unfinished ?? false,
      dirty: options.dirty ?? false,
      isNavigationAllowed: () => options.allowed ?? false,
    }),
  );

describe('useCreateLeaveGuard', () => {
  it('never blocks navigation while an operation is unfinished, and only the browser is asked on unload', async () => {
    guard({ unfinished: true, dirty: true });
    expect(await blocker.shouldBlockFn()).toBe(false);
    expect(blocker.enableBeforeUnload).toBe(true);
  });

  it('lets a clean form leave without asking or a browser prompt', async () => {
    guard({});
    expect(await blocker.shouldBlockFn()).toBe(false);
    expect(blocker.enableBeforeUnload).toBe(false);
  });

  it('lets the navigation caused by completing the operation pass', async () => {
    guard({ dirty: true, allowed: true });
    expect(await blocker.shouldBlockFn()).toBe(false);
  });

  it('asks before abandoning unsaved edits: stay blocks, leave anyway proceeds', async () => {
    const { result } = guard({ dirty: true });
    let leaving!: Promise<boolean>;
    act(() => {
      leaving = Promise.resolve(blocker.shouldBlockFn());
    });
    expect(result.current.open).toBe(true);
    act(() => result.current.stay());
    await expect(leaving).resolves.toBe(true);
    expect(result.current.open).toBe(false);

    act(() => {
      leaving = Promise.resolve(blocker.shouldBlockFn());
    });
    act(() => result.current.discard());
    await expect(leaving).resolves.toBe(false);
  });

  it('a second navigation while the dialog is open keeps the first from hanging', async () => {
    const { result } = guard({ dirty: true });
    let first!: Promise<boolean>;
    let second!: Promise<boolean>;
    act(() => {
      first = Promise.resolve(blocker.shouldBlockFn());
      second = Promise.resolve(blocker.shouldBlockFn());
    });
    await expect(first).resolves.toBe(true);
    act(() => result.current.discard());
    await expect(second).resolves.toBe(false);
  });
});
