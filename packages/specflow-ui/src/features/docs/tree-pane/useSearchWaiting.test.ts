// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSearchWaiting } from './useSearchWaiting';

describe('useSearchWaiting', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('stays quiet for 400 ms, is delayed until 2 s, then preparing', () => {
    const { result } = renderHook(() => useSearchWaiting(true, 'a'));
    act(() => {
      vi.advanceTimersByTime(399);
    });
    expect(result.current).toBe('quiet');
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe('delayed');
    act(() => {
      vi.advanceTimersByTime(1599);
    });
    expect(result.current).toBe('delayed');
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe('preparing');
  });

  it('restarts for a new request and is quiet once nothing is awaited', () => {
    const { result, rerender } = renderHook(
      ({ waiting, request }) => useSearchWaiting(waiting, request),
      { initialProps: { waiting: true, request: 'a' } },
    );
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current).toBe('preparing');

    rerender({ waiting: true, request: 'ab' });
    expect(result.current).toBe('quiet');
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(result.current).toBe('delayed');

    rerender({ waiting: false, request: 'ab' });
    expect(result.current).toBe('quiet');
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current).toBe('quiet');
  });
});
