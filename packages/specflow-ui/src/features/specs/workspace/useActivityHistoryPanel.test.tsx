// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useActivityHistoryPanel } from './useActivityHistoryPanel';

const navigation = vi.hoisted(() => ({
  isOpen: false,
  close: vi.fn<() => Promise<boolean>>(),
}));

vi.mock('@nevo/ui', () => ({ useSecondaryNavigation: () => navigation }));

beforeEach(() => {
  navigation.isOpen = false;
  navigation.close.mockReset();
});
afterEach(cleanup);

describe('useActivityHistoryPanel while a preview covers the history', () => {
  it('reports the covered history as not shown', () => {
    navigation.isOpen = true; // a Task or document preview is open over the history
    const { result } = renderHook(() => useActivityHistoryPanel('SPEC-1', true));

    expect(result.current.open).toBe(true);
    expect(result.current.visible).toBe(false);
  });

  it('brings a covered history forward by closing the preview', async () => {
    navigation.isOpen = true;
    navigation.close.mockResolvedValue(true);
    const { result, rerender } = renderHook(() => useActivityHistoryPanel('SPEC-1', true));

    await act(() => result.current.toggle());
    navigation.isOpen = false;
    rerender();

    expect(navigation.close).toHaveBeenCalledTimes(1);
    expect(result.current.open).toBe(true);
    expect(result.current.visible).toBe(true);
  });

  it('opens an empty history from behind a preview once the preview has closed', async () => {
    navigation.isOpen = true;
    navigation.close.mockResolvedValue(true);
    const { result } = renderHook(() => useActivityHistoryPanel('SPEC-1', false));
    expect(result.current.open).toBe(false);

    await act(() => result.current.toggle());

    expect(navigation.close).toHaveBeenCalledTimes(1);
    expect(result.current.open).toBe(true);
  });

  it('changes nothing when the preview’s leave guard keeps it', async () => {
    navigation.isOpen = true;
    navigation.close.mockResolvedValue(false);
    const { result } = renderHook(() => useActivityHistoryPanel('SPEC-1', false));

    await act(() => result.current.toggle());

    expect(navigation.close).toHaveBeenCalledTimes(1);
    expect(result.current.open).toBe(false);
    expect(result.current.visible).toBe(false);
  });

  it('hides a shown history without touching the Secondary flows', async () => {
    const { result } = renderHook(() => useActivityHistoryPanel('SPEC-1', true));

    await act(() => result.current.toggle());

    expect(navigation.close).not.toHaveBeenCalled();
    expect(result.current.open).toBe(false);
  });
});
