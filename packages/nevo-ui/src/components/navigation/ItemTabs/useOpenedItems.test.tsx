// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useOpenedItems, type UseOpenedItemsOptions } from './useOpenedItems';

interface Entry {
  id: string;
}
const entry = (id: string): Entry => ({ id });
const ids = (items: readonly Entry[]) => items.map((item) => item.id);

function setup(options: UseOpenedItemsOptions<Entry> = {}) {
  return renderHook((props: UseOpenedItemsOptions<Entry>) => useOpenedItems<Entry>(props), {
    initialProps: options,
  });
}

describe('useOpenedItems', () => {
  it('starts from the initial items and activates the first by default', () => {
    const { result } = setup({ initialItems: [entry('a'), entry('b')] });
    expect(ids(result.current.items)).toEqual(['a', 'b']);
    expect(result.current.activeId).toBe('a');
  });

  it('honours an explicit null as "nothing active"', () => {
    const { result } = setup({ initialItems: [entry('a')], initialActiveId: null });
    expect(result.current.activeId).toBeNull();
  });

  it('opens a new item and activates it', () => {
    const { result } = setup();
    expect(result.current.activeId).toBeNull();
    act(() => result.current.open(entry('a')));
    act(() => result.current.open(entry('b')));
    expect(ids(result.current.items)).toEqual(['a', 'b']);
    expect(result.current.activeId).toBe('b');
  });

  it('activates instead of duplicating when the id is already open', () => {
    const { result } = setup({ initialItems: [entry('a'), entry('b')], initialActiveId: 'b' });
    act(() => result.current.open(entry('a')));
    expect(ids(result.current.items)).toEqual(['a', 'b']);
    expect(result.current.activeId).toBe('a');
  });

  it('activates only open items', () => {
    const { result } = setup({ initialItems: [entry('a'), entry('b')] });
    act(() => result.current.activate('b'));
    expect(result.current.activeId).toBe('b');
    act(() => result.current.activate('missing'));
    expect(result.current.activeId).toBe('b');
  });

  it('activates the right neighbour when the active item closes, else the left', () => {
    const { result } = setup({
      initialItems: [entry('a'), entry('b'), entry('c')],
      initialActiveId: 'b',
    });
    act(() => result.current.close('b'));
    expect(result.current.activeId).toBe('c');
    act(() => result.current.close('c'));
    expect(result.current.activeId).toBe('a');
    act(() => result.current.close('a'));
    expect(result.current.items).toHaveLength(0);
    expect(result.current.activeId).toBeNull();
  });

  it('closeAll empties the set and clears the active item', () => {
    const { result } = setup({ initialItems: [entry('a'), entry('b')] });
    act(() => result.current.closeAll());
    expect(result.current.items).toHaveLength(0);
    expect(result.current.activeId).toBeNull();
  });

  it('keeps the active item when another one closes', () => {
    const { result } = setup({ initialItems: [entry('a'), entry('b')], initialActiveId: 'a' });
    act(() => result.current.close('b'));
    expect(result.current.activeId).toBe('a');
    expect(ids(result.current.items)).toEqual(['a']);
  });

  it('resets to the initial state when the scope changes', () => {
    const { result, rerender } = setup({ scope: 'one', initialItems: [entry('a')] });
    act(() => result.current.open(entry('b')));
    expect(ids(result.current.items)).toEqual(['a', 'b']);
    rerender({ scope: 'two', initialItems: [entry('a')] });
    expect(ids(result.current.items)).toEqual(['a']);
    expect(result.current.activeId).toBe('a');
  });

  describe('requestClose', () => {
    it('closes without a guard', async () => {
      const { result } = setup({ initialItems: [entry('a')] });
      let closed = false;
      await act(async () => {
        closed = await result.current.requestClose('a');
      });
      expect(closed).toBe(true);
      expect(result.current.items).toHaveLength(0);
    });

    it('closes when an async guard resolves true', async () => {
      const canClose = vi.fn(() => Promise.resolve(true));
      const { result } = setup({ initialItems: [entry('a'), entry('b')], canClose });
      await act(async () => {
        await result.current.requestClose('a');
      });
      expect(canClose).toHaveBeenCalledWith('a');
      expect(ids(result.current.items)).toEqual(['b']);
    });

    it('keeps the item when an async guard resolves false', async () => {
      const canClose = vi.fn(() => Promise.resolve(false));
      const { result } = setup({ initialItems: [entry('a')], canClose });
      let closed = true;
      await act(async () => {
        closed = await result.current.requestClose('a');
      });
      expect(closed).toBe(false);
      expect(ids(result.current.items)).toEqual(['a']);
    });

    it('supports a synchronous guard', async () => {
      const { result } = setup({ initialItems: [entry('a')], canClose: () => false });
      await act(async () => {
        await result.current.requestClose('a');
      });
      expect(ids(result.current.items)).toEqual(['a']);
    });

    it('ignores a late guard result after the scope changed', async () => {
      let settle: (value: boolean) => void = () => undefined;
      const canClose = () => new Promise<boolean>((resolve) => (settle = resolve));
      const { result, rerender } = setup({
        scope: 'one',
        initialItems: [entry('a'), entry('b')],
        canClose,
      });
      let pending: Promise<boolean> = Promise.resolve(false);
      act(() => {
        pending = result.current.requestClose('a');
      });
      rerender({ scope: 'two', initialItems: [entry('a'), entry('b')], canClose });
      await act(async () => {
        settle(true);
        await pending;
      });
      expect(ids(result.current.items)).toEqual(['a', 'b']);
    });

    it('ignores a late guard result after A -> B -> A: the new session keeps its item', async () => {
      let settle: (value: boolean) => void = () => undefined;
      const canClose = () => new Promise<boolean>((resolve) => (settle = resolve));
      const items = [entry('x'), entry('y')];
      const { result, rerender } = setup({ scope: 'A', initialItems: items, canClose });
      let pending: Promise<boolean> = Promise.resolve(true);
      act(() => {
        pending = result.current.requestClose('x');
      });
      rerender({ scope: 'B', initialItems: items, canClose });
      rerender({ scope: 'A', initialItems: items, canClose });
      expect(ids(result.current.items)).toEqual(['x', 'y']);
      let closed = true;
      await act(async () => {
        settle(true);
        closed = await pending;
      });
      expect(closed).toBe(false);
      expect(ids(result.current.items)).toEqual(['x', 'y']);
    });

    it('resolves false when the item is not open', async () => {
      const canClose = vi.fn(() => true);
      const { result } = setup({ initialItems: [entry('a')], canClose });
      let closed = true;
      await act(async () => {
        closed = await result.current.requestClose('missing');
      });
      expect(closed).toBe(false);
      expect(ids(result.current.items)).toEqual(['a']);
    });

    it('shares one guard call between parallel requests for the same id', async () => {
      let settle: (value: boolean) => void = () => undefined;
      const canClose = vi.fn(() => new Promise<boolean>((resolve) => (settle = resolve)));
      const { result } = setup({ initialItems: [entry('a'), entry('b')], canClose });
      let first: Promise<boolean> = Promise.resolve(false);
      let second: Promise<boolean> = Promise.resolve(false);
      act(() => {
        first = result.current.requestClose('a');
        second = result.current.requestClose('a');
      });
      let results: boolean[] = [];
      await act(async () => {
        settle(true);
        results = await Promise.all([first, second]);
      });
      expect(canClose).toHaveBeenCalledTimes(1);
      expect(results).toEqual([true, true]);
      expect(ids(result.current.items)).toEqual(['b']);
    });

    it('does nothing when the host unmounts while the guard is pending', async () => {
      let settle: (value: boolean) => void = () => undefined;
      const canClose = () => new Promise<boolean>((resolve) => (settle = resolve));
      const { result, unmount } = setup({ initialItems: [entry('a')], canClose });
      let pending: Promise<boolean> = Promise.resolve(true);
      act(() => {
        pending = result.current.requestClose('a');
      });
      unmount();
      settle(true);
      await expect(pending).resolves.toBe(false);
    });
  });
});
