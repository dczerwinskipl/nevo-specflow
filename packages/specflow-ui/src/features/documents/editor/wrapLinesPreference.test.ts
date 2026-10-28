// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  WRAP_LINES_STORAGE_KEY,
  setWrapLines,
  useWrapLinesPreference,
  wrapLinesFor,
} from './wrapLinesPreference';

afterEach(() => localStorage.clear());

describe('Wrap lines preference', () => {
  it('wraps by default on narrow and wide panes', () => {
    expect(wrapLinesFor({}, 'narrow')).toBe(true);
    expect(wrapLinesFor({}, 'wide')).toBe(true);
  });

  it('keeps the choice per pane class in this browser and re-reads it', () => {
    const { result } = renderHook(() => useWrapLinesPreference());
    act(() => setWrapLines('wide', false));
    expect(result.current).toEqual({ wide: false });
    expect(wrapLinesFor(result.current, 'wide')).toBe(false);
    // A narrow pane keeps its own default.
    expect(wrapLinesFor(result.current, 'narrow')).toBe(true);
    expect(JSON.parse(localStorage.getItem(WRAP_LINES_STORAGE_KEY)!)).toEqual({ wide: false });
  });

  it('ignores a stored value it does not understand', () => {
    localStorage.setItem(WRAP_LINES_STORAGE_KEY, '{"narrow":"yes"');
    const { result } = renderHook(() => useWrapLinesPreference());
    expect(result.current).toEqual({});
  });
});
