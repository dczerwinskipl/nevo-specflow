// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ItemTabs,
  getItemTabId,
  getItemTabPanelId,
  type ItemTab,
  type ItemTabsProps,
} from './ItemTabs';
import { useOpenedItems } from './useOpenedItems';

let containerWidth = 1000;
const observers: (() => void)[] = [];

beforeEach(() => {
  containerWidth = 1000;
  observers.length = 0;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(private readonly callback: () => void) {}
      observe() {
        observers.push(this.callback);
      }
      disconnect() {}
      unobserve() {}
    },
  );
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    () =>
      ({
        width: containerWidth,
        height: 56,
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
      }) as DOMRect,
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const makeItem = (id: string, overrides: Partial<ItemTab> = {}): ItemTab => ({
  id,
  label: `${id}.md`,
  description: `docs/${id}.md`,
  icon: 'file',
  ...overrides,
});
const makeItems = (count: number) => Array.from({ length: count }, (_, i) => makeItem(`item-${i}`));

function renderTabs(props: Partial<ItemTabsProps> = {}) {
  const onActivate = vi.fn();
  const onClose = vi.fn();
  const items = props.items ?? makeItems(3);
  const utils = render(
    <ItemTabs
      items={items}
      activeId={items[0]?.id ?? null}
      onActivate={onActivate}
      onClose={onClose}
      scope="t"
      {...props}
    />,
  );
  return { ...utils, onActivate, onClose };
}

function resize(width: number) {
  containerWidth = width;
  act(() => observers.forEach((callback) => callback()));
}

describe('ItemTabs', () => {
  it('renders a tablist with named tabs and a roving tab stop on the active tab', () => {
    renderTabs({ activeId: 'item-1' });
    expect(screen.getByRole('tablist', { name: 'Opened items' })).toBeTruthy();
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.getAttribute('aria-selected'))).toEqual([
      'false',
      'true',
      'false',
    ]);
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([-1, 0, -1]);
    expect(tabs[1]?.id).toBe(getItemTabId('t', 'item-1'));
    expect(tabs[1]?.getAttribute('aria-controls')).toBe(getItemTabPanelId('t', 'item-1'));
    expect(tabs[0]?.hasAttribute('aria-controls')).toBe(false);
    expect(screen.getByRole('tab', { name: 'item-1.md' })).toBe(tabs[1]);
  });

  it('keeps the space at the split point of a middle-truncated label', () => {
    renderTabs({ items: [makeItem('ux', { label: 'Single sign-on - UX' })] });
    const tab = screen.getByRole('tab', { name: 'Single sign-on - UX' });
    const halves = Array.from(tab.querySelectorAll('[aria-hidden="true"]')).filter(
      (node) => node.textContent,
    );
    expect(halves.map((node) => node.textContent).join('')).toBe('Single sign-on - UX');
    const head = halves[0]!;
    expect(head.textContent?.endsWith(' ')).toBe(true);
    // A truncating head with `white-space: nowrap` collapses its trailing space; `pre` keeps it.
    expect(head.className).toContain('whitespace-pre');
    expect(head.className).not.toMatch(/\btruncate\b|whitespace-nowrap/);
  });

  it('keeps the tablist free of non-tab owned elements and close buttons out of the tab order', () => {
    renderTabs();
    const tablist = screen.getByRole('tablist');
    expect(within(tablist).queryAllByRole('button')).toHaveLength(0);
    for (const close of screen.getAllByRole('button', { name: /^Close / })) {
      expect(close.tabIndex).toBe(-1);
    }
  });

  it('announces every status together, not only the first', () => {
    renderTabs({
      items: [
        makeItem('a', { state: 'missing', dirty: true }),
        makeItem('b', { state: 'loading', dirty: true }),
      ],
    });
    expect(
      screen.getByRole('tab', { name: /^a\.md\s*\(not found, unsaved changes\)$/ }),
    ).toBeTruthy();
    expect(
      screen.getByRole('tab', { name: /^b\.md\s*\(loading, unsaved changes\)$/ }),
    ).toBeTruthy();
  });

  it('announces dirty, loading and missing states', () => {
    renderTabs({
      items: [
        makeItem('a', { dirty: true }),
        makeItem('b', { state: 'loading' }),
        makeItem('c', { state: 'missing' }),
      ],
    });
    expect(screen.getByRole('tab', { name: /^a\.md\s*\(unsaved changes\)$/ })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /^b\.md\s*\(loading\)$/ })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /^c\.md\s*\(not found\)$/ })).toBeTruthy();
  });

  it('activates on click', () => {
    const { onActivate } = renderTabs();
    fireEvent.click(screen.getByRole('tab', { name: 'item-2.md' }));
    expect(onActivate).toHaveBeenCalledWith('item-2');
  });

  describe('keyboard', () => {
    it('moves focus without activating by default (manual activation)', () => {
      const { onActivate } = renderTabs();
      const tabs = screen.getAllByRole('tab');
      tabs[0]?.focus();
      fireEvent.keyDown(tabs[0]!, { key: 'ArrowRight' });
      expect(document.activeElement).toBe(tabs[1]);
      expect(onActivate).not.toHaveBeenCalled();
      expect(tabs[1]?.tabIndex).toBe(0);
      expect(tabs[0]?.tabIndex).toBe(-1);
    });

    it('wraps with arrows and jumps with Home and End', () => {
      renderTabs();
      const tabs = screen.getAllByRole('tab');
      tabs[0]?.focus();
      fireEvent.keyDown(tabs[0]!, { key: 'ArrowLeft' });
      expect(document.activeElement).toBe(tabs[2]);
      fireEvent.keyDown(tabs[2]!, { key: 'ArrowRight' });
      expect(document.activeElement).toBe(tabs[0]);
      fireEvent.keyDown(tabs[0]!, { key: 'End' });
      expect(document.activeElement).toBe(tabs[2]);
      fireEvent.keyDown(tabs[2]!, { key: 'Home' });
      expect(document.activeElement).toBe(tabs[0]);
    });

    it('activates on focus movement in automatic mode', () => {
      const { onActivate } = renderTabs({ activation: 'automatic' });
      const tabs = screen.getAllByRole('tab');
      tabs[0]?.focus();
      fireEvent.keyDown(tabs[0]!, { key: 'ArrowRight' });
      expect(onActivate).toHaveBeenCalledWith('item-1');
    });

    it('closes the focused tab with Delete', () => {
      const { onClose } = renderTabs();
      const tabs = screen.getAllByRole('tab');
      tabs[1]?.focus();
      fireEvent.keyDown(tabs[1]!, { key: 'Delete' });
      expect(onClose).toHaveBeenCalledWith('item-1');
    });
  });

  describe('closing', () => {
    it('closes with the x button', () => {
      const { onClose } = renderTabs();
      fireEvent.click(screen.getByRole('button', { name: 'Close item-2.md' }));
      expect(onClose).toHaveBeenCalledWith('item-2');
    });

    it('closes on middle click only', () => {
      const { onClose } = renderTabs();
      const tab = screen.getByRole('tab', { name: 'item-1.md' });
      fireEvent(tab, new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 2 }));
      expect(onClose).not.toHaveBeenCalled();
      fireEvent(tab, new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 }));
      expect(onClose).toHaveBeenCalledWith('item-1');
    });

    it('works with the useOpenedItems async guard: cancel keeps the tab, confirm removes it', async () => {
      let answer = false;
      function Host() {
        const opened = useOpenedItems<ItemTab>({
          initialItems: makeItems(2),
          canClose: () => Promise.resolve(answer),
        });
        return (
          <ItemTabs
            items={opened.items}
            activeId={opened.activeId}
            onActivate={opened.activate}
            onClose={(id) => void opened.requestClose(id)}
            scope="t"
          />
        );
      }
      render(<Host />);
      fireEvent.click(screen.getByRole('button', { name: 'Close item-0.md' }));
      await act(async () => {});
      expect(screen.getAllByRole('tab')).toHaveLength(2);
      answer = true;
      fireEvent.click(screen.getByRole('button', { name: 'Close item-0.md' }));
      await act(async () => {});
      expect(screen.getAllByRole('tab')).toHaveLength(1);
      expect(screen.getByRole('tab', { selected: true }).dataset.itemId).toBe('item-1');
    });
  });

  describe('focus after close', () => {
    function Host({
      initial,
      canClose,
    }: {
      initial: ItemTab[];
      canClose?: (id: string) => boolean | Promise<boolean>;
    }) {
      const opened = useOpenedItems<ItemTab>({ initialItems: initial, canClose });
      return (
        <ItemTabs
          items={opened.items}
          activeId={opened.activeId}
          onActivate={opened.activate}
          onClose={(id) => void opened.requestClose(id).catch(() => undefined)}
          scope="t"
        />
      );
    }

    it('moves focus to the right neighbour, else the left, when a tab is closed with Delete', () => {
      render(<Host initial={makeItems(3)} />);
      const focusTab = (name: string) => {
        const tab = screen.getByRole('tab', { name });
        tab.focus();
        return tab;
      };
      fireEvent.keyDown(focusTab('item-1.md'), { key: 'Delete' });
      expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'item-2.md' }));
      fireEvent.keyDown(document.activeElement!, { key: 'Delete' });
      expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'item-0.md' }));
      expect(screen.getByRole('tab', { name: 'item-0.md' }).tabIndex).toBe(0);
    });

    it('moves focus off the removed x button too', () => {
      render(<Host initial={makeItems(2)} />);
      const close = screen.getByRole('button', { name: 'Close item-0.md' });
      close.focus();
      fireEvent.click(close);
      expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'item-1.md' }));
    });

    const settleTimers = () =>
      act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });
    async function openMenu(count: number) {
      fireEvent.pointerDown(screen.getByRole('button', { name: `Opened items (${count})` }), {
        button: 0,
        ctrlKey: false,
        pointerType: 'mouse',
      });
      return screen.findByRole('menu');
    }
    const rowOf = (menu: HTMLElement, label: string) =>
      within(menu).getByRole('menuitem', { name: new RegExp(`^${label.replace('.', '\\.')}`) });
    const closers = {
      'Close menuitem': (menu: HTMLElement) =>
        fireEvent.click(within(menu).getByRole('menuitem', { name: 'Close item-7.md' })),
      'row x': (menu: HTMLElement) =>
        fireEvent.click(rowOf(menu, 'item-7.md').querySelector('[title="Close"]')!),
      'Delete on the row': (menu: HTMLElement) =>
        fireEvent.keyDown(rowOf(menu, 'item-7.md'), { key: 'Delete' }),
    };

    for (const [way, close] of Object.entries(closers)) {
      it(`keeps focus on a tab when ${way} in the Opened menu removes the trigger`, async () => {
        containerWidth = 1000;
        render(<Host initial={makeItems(8)} />);
        close(await openMenu(8));
        await settleTimers();
        expect(screen.queryByRole('button', { name: /^Opened items/ })).toBeNull();
        expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'item-6.md' }));
      });
    }

    it('waits for a delayed guard before moving focus, then lands on the neighbour', async () => {
      containerWidth = 1000;
      let allow: (value: boolean) => void = () => undefined;
      render(
        <Host
          initial={makeItems(8)}
          canClose={() => new Promise<boolean>((resolve) => (allow = resolve))}
        />,
      );
      closers['Close menuitem'](await openMenu(8));
      await settleTimers();
      expect(screen.getAllByRole('tab').length).toBe(6);
      await act(async () => allow(true));
      await settleTimers();
      expect(screen.getAllByRole('tab')).toHaveLength(7);
      expect(document.activeElement).not.toBe(document.body);
      expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'item-6.md' }));
    });

    it('leaves the item and focus alone when the guard refuses', async () => {
      containerWidth = 1000;
      render(<Host initial={makeItems(8)} canClose={() => Promise.resolve(false)} />);
      closers['Close menuitem'](await openMenu(8));
      await settleTimers();
      expect(screen.getByRole('button', { name: 'Opened items (8)' })).toBeTruthy();
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Opened items (8)' }));
      expect(screen.getAllByRole('tab')).toHaveLength(6);
    });

    it('does not steal focus from outside the strip', () => {
      render(
        <>
          <button type="button">Elsewhere</button>
          <Host initial={makeItems(2)} />
        </>,
      );
      const elsewhere = screen.getByRole('button', { name: 'Elsewhere' });
      elsewhere.focus();
      fireEvent.click(screen.getByRole('button', { name: 'Close item-0.md' }));
      expect(document.activeElement).toBe(elsewhere);
    });
  });

  describe('overflow', () => {
    it('shows floor((width - 52) / 140) tabs plus the Opened (N) trigger', () => {
      containerWidth = 700;
      renderTabs({ items: makeItems(8), activeId: 'item-0' });
      expect(screen.getAllByRole('tab')).toHaveLength(4);
      expect(screen.getByRole('button', { name: 'Opened items (8)' })).toBeTruthy();
    });

    it('keeps the active tab visible when it would be hidden', () => {
      containerWidth = 700;
      renderTabs({ items: makeItems(8), activeId: 'item-7' });
      const names = screen.getAllByRole('tab').map((tab) => tab.dataset.itemId);
      expect(names).toContain('item-7');
      expect(names).toHaveLength(4);
    });

    it('recomputes when the container resizes', () => {
      containerWidth = 1200;
      renderTabs({ items: makeItems(8) });
      expect(screen.getAllByRole('tab')).toHaveLength(8);
      expect(screen.queryByRole('button', { name: /^Opened items/ })).toBeNull();
      resize(700);
      expect(screen.getAllByRole('tab')).toHaveLength(4);
    });

    it('offers an accessible Close menuitem per row, for users without a keyboard', async () => {
      containerWidth = 700;
      const { onClose } = renderTabs({ items: makeItems(8) });
      fireEvent.pointerDown(screen.getByRole('button', { name: 'Opened items (8)' }), {
        button: 0,
        ctrlKey: false,
        pointerType: 'mouse',
      });
      const menu = await screen.findByRole('menu');
      expect(within(menu).getAllByRole('menuitem', { name: /^Close / })).toHaveLength(8);
      fireEvent.click(within(menu).getByRole('menuitem', { name: 'Close item-5.md' }));
      expect(onClose).toHaveBeenCalledWith('item-5');
    });

    it('offers the same Close menuitem in the switcher', async () => {
      const { onClose } = renderTabs({ variant: 'switcher', items: makeItems(3) });
      fireEvent.pointerDown(screen.getByRole('button', { name: /opened$/ }), {
        button: 0,
        ctrlKey: false,
        pointerType: 'mouse',
      });
      const menu = await screen.findByRole('menu');
      fireEvent.click(within(menu).getByRole('menuitem', { name: 'Close item-1.md' }));
      expect(onClose).toHaveBeenCalledWith('item-1');
    });

    it('lists every item with its description in the Opened menu and activates from it', async () => {
      containerWidth = 700;
      const { onActivate } = renderTabs({ items: makeItems(8) });
      const trigger = screen.getByRole('button', { name: 'Opened items (8)' });
      fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: 'mouse' });
      const menu = await screen.findByRole('menu');
      const rows = within(menu).getAllByRole('menuitem', { name: /^(?!Close )/ });
      expect(rows).toHaveLength(8);
      expect(within(menu).getAllByText('docs/item-7.md')).toHaveLength(1);
      fireEvent.click(rows[7]!);
      expect(onActivate).toHaveBeenCalledWith('item-7');
    });
  });

  describe('switcher', () => {
    it('replaces the strip with a name (N) button under 480 px', () => {
      containerWidth = 390;
      renderTabs({ items: [makeItem('a', { dirty: true }), makeItem('b')], activeId: 'a' });
      expect(screen.queryByRole('tablist')).toBeNull();
      const button = screen.getByRole('button', { name: 'a.md, unsaved changes, 2 opened' });
      expect(button.textContent).toContain('(2)');
    });

    it('switches presentation when the container crosses the threshold', () => {
      renderTabs();
      expect(screen.getByRole('tablist')).toBeTruthy();
      resize(400);
      expect(screen.queryByRole('tablist')).toBeNull();
      resize(900);
      expect(screen.getByRole('tablist')).toBeTruthy();
    });

    it('can be forced and tuned', () => {
      renderTabs({ variant: 'switcher' });
      expect(screen.queryByRole('tablist')).toBeNull();
      cleanup();
      containerWidth = 600;
      renderTabs({ switcherBelow: 700 });
      expect(screen.queryByRole('tablist')).toBeNull();
    });

    it('names the empty state when nothing is active', () => {
      renderTabs({ variant: 'switcher', items: [], activeId: null });
      expect(screen.getByRole('button', { name: 'Opened items (0)' }).textContent).toContain(
        'No item',
      );
    });
  });

  describe('labels', () => {
    it('replaces every generated string', () => {
      renderTabs({
        items: [makeItem('a', { dirty: true })],
        activeId: 'a',
        labels: {
          tablist: 'Otwarte elementy',
          close: (label) => `Zamknij ${label}`,
          status: { dirty: 'niezapisane zmiany' },
        },
      });
      expect(screen.getByRole('tablist', { name: 'Otwarte elementy' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Zamknij a.md' })).toBeTruthy();
      expect(screen.getByRole('tab', { name: /^a\.md\s*\(niezapisane zmiany\)$/ })).toBeTruthy();
    });

    it('localizes the switcher name', () => {
      renderTabs({
        variant: 'switcher',
        items: [makeItem('a')],
        activeId: 'a',
        labels: { switcher: ({ label, count }) => `${label}: otwarte ${count}` },
      });
      expect(screen.getByRole('button', { name: 'a.md: otwarte 1' })).toBeTruthy();
    });
  });
});
