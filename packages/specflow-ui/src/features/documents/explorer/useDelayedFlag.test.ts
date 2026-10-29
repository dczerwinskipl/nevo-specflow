// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BUSY_INDICATOR_DELAY_MS, useDelayedFlag } from './useDelayedFlag';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('the busy indicator of the tree', () => {
  it('never shows for an operation quicker than the delay', () => {
    const { result, rerender } = renderHook(({ busy }) => useDelayedFlag(busy), {
      initialProps: { busy: true },
    });
    act(() => {
      vi.advanceTimersByTime(BUSY_INDICATOR_DELAY_MS - 1);
    });
    expect(result.current).toBe(false);
    rerender({ busy: false });
    act(() => {
      vi.advanceTimersByTime(BUSY_INDICATOR_DELAY_MS);
    });
    expect(result.current).toBe(false);
  });

  it('shows once the operation runs longer and hides as soon as it ends', () => {
    const { result, rerender } = renderHook(({ busy }) => useDelayedFlag(busy), {
      initialProps: { busy: true },
    });
    act(() => {
      vi.advanceTimersByTime(BUSY_INDICATOR_DELAY_MS);
    });
    expect(result.current).toBe(true);
    rerender({ busy: false });
    expect(result.current).toBe(false);
    // A next operation waits for the delay again.
    rerender({ busy: true });
    expect(result.current).toBe(false);
  });
});
