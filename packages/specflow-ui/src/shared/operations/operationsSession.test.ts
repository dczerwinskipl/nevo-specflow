// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  dismissOperation,
  resetOperationsSession,
  setOperationsCollapsed,
  useDismissedOperations,
  useOperationsCollapsed,
} from './operationsSession';

afterEach(() => {
  cleanup();
  resetOperationsSession();
});

describe('operations session state', () => {
  it('remembers hidden rows for the session and notifies readers', () => {
    const { result } = renderHook(() => useDismissedOperations());
    expect([...result.current]).toEqual([]);
    act(() => dismissOperation('a'));
    act(() => dismissOperation('a'));
    act(() => dismissOperation('b'));
    expect([...result.current]).toEqual(['a', 'b']);
  });

  it('keeps the collapsed state and starts a new session expanded', () => {
    const { result } = renderHook(() => useOperationsCollapsed());
    expect(result.current[0]).toBe(false);
    act(() => result.current[1](true));
    expect(result.current[0]).toBe(true);
    act(() => resetOperationsSession());
    expect(result.current[0]).toBe(false);
    act(() => setOperationsCollapsed(true));
    expect(result.current[0]).toBe(true);
  });
});
