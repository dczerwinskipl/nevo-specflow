// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { formatRelativeTime, minutesSince, relativeTimeTickMs, useNow } from './relativeTime';

const now = Date.parse('2026-06-01T12:00:00.000Z');
const ago = (seconds: number) => new Date(now - seconds * 1000).toISOString();

describe('formatRelativeTime', () => {
  it('says "now" within a few seconds and counts minutes, hours and days after', () => {
    expect(formatRelativeTime(ago(10), now, 'en')).toBe('now');
    expect(formatRelativeTime(ago(5 * 60), now, 'en')).toBe('5 minutes ago');
    expect(formatRelativeTime(ago(2 * 3600), now, 'en')).toBe('2 hours ago');
    expect(formatRelativeTime(ago(3 * 86_400), now, 'en')).toBe('3 days ago');
  });

  it('speaks the language of the UI', () => {
    expect(formatRelativeTime(ago(5 * 60), now, 'pl')).toBe('5 minut temu');
  });

  it('is undefined for a date it cannot read', () => {
    expect(formatRelativeTime('nope', now, 'en')).toBeUndefined();
    expect(minutesSince('nope', now)).toBeUndefined();
  });
});

describe('minutesSince', () => {
  it('floors to whole minutes and never goes negative', () => {
    expect(minutesSince(ago(7 * 60 + 40), now)).toBe(7);
    expect(minutesSince(ago(-60), now)).toBe(0);
  });
});

describe('useNow', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('ticks every 30 s for all readers with a single interval', () => {
    const first = renderHook(() => useNow());
    const second = renderHook(() => useNow());
    expect(vi.getTimerCount()).toBe(1);
    const start = first.result.current;
    act(() => {
      vi.advanceTimersByTime(relativeTimeTickMs);
    });
    expect(first.result.current).toBe(start + relativeTimeTickMs);
    expect(second.result.current).toBe(first.result.current);
    first.unmount();
    second.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
