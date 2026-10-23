// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TabContent } from './types.stories-support';
import { useTabHost } from './useTabHost.stories-support';

const settle = vi.fn();
const content = (id: string) =>
  ({
    label: id,
    path: id,
    dirty: id.startsWith('dirty'),
    render: () => null,
    actions: () => [],
    settle,
  }) satisfies TabContent;

const setup = () =>
  renderHook(() =>
    useTabHost({ open: ['dirty-a', 'dirty-b', 'clean'], active: 'dirty-a' }, content),
  );

describe('useTabHost close guard', () => {
  it('parks one dirty close and refuses a parallel one instead of overwriting it', async () => {
    const { result } = setup();
    act(() => result.current.requestClose('dirty-a'));
    expect(result.current.pendingClose).toBe('dirty-a');
    act(() => result.current.requestClose('dirty-b'));
    expect(result.current.pendingClose).toBe('dirty-a');
    await act(async () => {
      result.current.confirmClose('discard');
      await Promise.resolve();
    });
    expect(result.current.open).toEqual(['dirty-b', 'clean']);
  });

  it('keeps the document when the dialog is cancelled', async () => {
    const { result } = setup();
    act(() => result.current.requestClose('dirty-a'));
    await act(async () => {
      result.current.cancelClose();
      await Promise.resolve();
    });
    expect(result.current.pendingClose).toBeNull();
    expect(result.current.open).toHaveLength(3);
  });

  it('closes clean documents without a dialog', async () => {
    const { result } = setup();
    await act(async () => {
      result.current.requestClose('clean');
      await Promise.resolve();
    });
    expect(result.current.pendingClose).toBeNull();
    expect(result.current.open).toEqual(['dirty-a', 'dirty-b']);
  });
});
