// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  dismissOperation,
  resetOperationsSession,
  useDismissedOperations,
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
});
