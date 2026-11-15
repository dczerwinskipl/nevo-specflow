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
/** Rendered width of each measured label by text; unlisted labels read 0, as without layout. */
let labelWidths: Record<string, number> = {};
const observers: (() => void)[] = [];
let frames = new Map<number, FrameRequestCallback>();

beforeEach(() => {
  containerWidth = 1000;
  labelWidths = {};
  observers.length = 0;
  frames = new Map();
  let nextFrame = 0;
  // The width hook coalesces ResizeObserver notifications through requestAnimationFrame.
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback);

    return nextFrame;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
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
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const label = this.hasAttribute('data-item-tabs-measure') ? this.textContent : undefined;

    return {
      width: label === undefined ? containerWidth : (labelWidths[label] ?? 0),
      height: 56,
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    } as DOMRect;
  });
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
  act(() => {
    observers.forEach((callback) => callback());
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((callback) => callback(0));
  });
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

  it('sizes each tab to its own label, and marks the active one by underline and text only', () => {
    renderTabs({
      items: [
        makeItem('plan', { label: 'Planning', icon: undefined }),
        makeItem('long', { label: 'Historia pracy agenta', icon: undefined }),
        makeItem('pinned', { label: 'Planning', icon: undefined, closable: false }),
      ],
      activeId: 'plan',
    });
    const width = (name: string, index = 0) =>
      Number.parseFloat(screen.getAllByRole('tab', { name })[index]!.parentElement!.style.width);
    // jsdom has no layout, so the label is estimated (6.4 px a character); a browser measures it.
    expect(width('Planning')).toBe(42 + 51);
    expect(width('Historia pracy agenta')).toBe(42 + 134);
    // No close slot on a non-closable tab: symmetric padding instead.
    expect(width('Planning', 1)).toBe(20 + 51);
    expect(screen.getAllByRole('tab', { name: 'Planning' })[1]!.className).toContain('pr-2.5');

    const active = screen.getAllByRole('tab', { name: 'Planning' })[0]!;
    expect(active.className).toContain('border-b-action-primary');
    expect(active.className).toContain('text-content-primary');
    expect(active.className).not.toMatch(/\bbg-surface-control\b|rounded-t/);
    expect(active.className).toContain('whitespace-nowrap');
  });

  describe('density="rail" (the Secondary editor tabs)', () => {
    const railItems = [
      makeItem('context', { label: 'Context', icon: undefined, closable: false }),
      makeItem('history', { label: 'Work history', icon: undefined }),
      makeItem('files', { label: 'Files', icon: undefined }),
    ];

    it('is the full 36px rail token and draws the strip with its own divider', () => {
      renderTabs({ items: railItems, activeId: 'history', density: 'rail' });
      const root = screen.getByRole('tablist').parentElement!;
      expect(root.className).toContain('h-tab-rail');
      expect(root.className).not.toContain('calc');
      // The strip continues past the last tab with the same fill and divider as the inactive tabs.
      const filler = root.lastElementChild as HTMLElement;
      expect(filler.className).toMatch(/\bbg-tab-strip\b/);
      expect(filler.className).toMatch(/\bborder-b\b/);
      expect(filler.className).toContain('border-border-subtle');
    });

    it('looks like an editor tab: 14px label, 1px separators, no gap, no icon', () => {
      renderTabs({ items: railItems, activeId: 'history', density: 'rail' });
      const tablist = screen.getByRole('tablist');
      expect(tablist.className).not.toContain('gap-');
      const [context, history, files] = screen.getAllByRole('tab');
      for (const tab of [context!, history!, files!]) {
        expect(tab.className).toContain('text-body-md');
        expect(tab.className).not.toContain('text-label-sm');
        expect(tab.className).toContain('border-r-border-subtle');
        expect(tab.querySelector('svg')).toBeNull();
      }

      // Active: the panel surface itself (no fill, no bottom border) under a 2px primary top
      // accent drawn over the 1px top border (the label does not move), never an underline.
      expect(history!.className).toContain('border-t-border-subtle');
      expect(history!.className).toContain('before:bg-action-primary');
      expect(history!.className).toContain('before:h-0.5');
      expect(files!.className).not.toContain('action-primary');
      expect(history!.className).toContain('border-b-transparent');
      expect(history!.className).toContain('text-content-primary');
      expect(history!.className).not.toMatch(/(^|\s)(hover:)?bg-/);
      expect(history!.className).not.toContain('border-b-action-primary');
      // Inactive: the darker strip, its bottom divider, no top edge.
      expect(files!.className).toContain('bg-tab-strip');
      expect(files!.className).toContain('border-b-border-subtle');
      expect(files!.className).toContain('border-t-transparent');
      // Pinned Context: no x, a pin in the trailing slot (which it keeps, like a closable tab).
      expect(context!.className).toContain('pr-8');
      expect(screen.queryByRole('button', { name: 'Close Context' })).toBeNull();
      expect(document.querySelectorAll('[data-item-pinned="true"]')).toHaveLength(1);
      // Every closable rail tab shows its x at rest, not only the active or hovered one.
      const closeFiles = screen.getByRole('button', { name: 'Close Files' });
      expect(closeFiles.className).toContain('opacity-100');
      expect(closeFiles.className).not.toContain('opacity-0');
    });

    it('sizes tabs with the rail metrics: 12px padding and a 7.4px estimated character', () => {
      renderTabs({ items: railItems, activeId: 'history', density: 'rail' });
      const width = (name: string) =>
        Number.parseFloat(screen.getByRole('tab', { name }).parentElement!.style.width);
      expect(width('Work history')).toBe(44 + Math.round('Work history'.length * 7.4));
      // The pinned tab keeps the trailing slot for its pin, so it is sized like a closable tab.
      expect(width('Context')).toBe(44 + Math.round('Context'.length * 7.4));
    });

    it('sizes a tab from the unrounded label width so a fractional label is not truncated', () => {
      // 39.4 and 40.2 need 40 and 41 px of text (ceil); offsetWidth would round them to 39 and 40.
      labelWidths = { 'a.md': 39.4, 'b.md': 40.2 };
      renderTabs({
        items: [makeItem('a', { icon: undefined }), makeItem('b', { icon: undefined })],
        activeId: 'a',
        density: 'rail',
      });
      const width = (name: string) =>
        Number.parseFloat(screen.getByRole('tab', { name }).parentElement!.style.width);
      expect(width('b.md')).toBe(width('a.md') + 1);
    });

    it('shows the dirty dot in the glyph slot of an iconless tab and reserves its width', () => {
      renderTabs({
        items: [
          makeItem('clean', { label: 'Clean', icon: undefined }),
          makeItem('dirty', { label: 'Clean', icon: undefined, dirty: true }),
        ],
        activeId: 'clean',
        density: 'rail',
      });
      const [clean, dirty] = screen.getAllByRole('tab');
      expect(clean!.querySelector('.bg-status-attention')).toBeNull();
      expect(dirty!.querySelector('.bg-status-attention')).not.toBeNull();
      expect(dirty!.querySelector('svg')).toBeNull();
      // Same label, so the only difference is the reserved glyph slot (14px + 8px gap).
      expect(Number.parseFloat(dirty!.parentElement!.style.width)).toBe(
        Number.parseFloat(clean!.parentElement!.style.width) + 22,
      );
    });

    it('stays a strip down to 292px, the header density keeps its 480px switcher', () => {
      containerWidth = 300;
      const { unmount } = renderTabs({ items: railItems, activeId: 'history', density: 'rail' });
      expect(screen.getAllByRole('tab')).toHaveLength(3);
      unmount();
      renderTabs({ items: railItems, activeId: 'history' });
      expect(screen.queryByRole('tab')).toBeNull();
    });

    it('keeps the header density unchanged: underline, rounded, 2px apart', () => {
      renderTabs({ items: railItems, activeId: 'history' });
      expect(screen.getByRole('tablist').className).toContain('gap-0.5');
      expect(screen.getByRole('tab', { name: 'Work history' }).className).toContain(
        'border-b-action-primary',
      );
      expect(screen.getByRole('tablist').parentElement!.className).not.toContain('h-tab-rail');
    });
  });

  it('keeps the space at the split point of a middle-truncated label', () => {
    // Narrower than the tab's content width, so its label is truncated in the middle.
    containerWidth = 150;
    renderTabs({ items: [makeItem('ux', { label: 'Single sign-on - UX' })], variant: 'strip' });
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
      fireEvent.pointerDown(screen.getByRole('button', { name: `More opened items (${count})` }), {
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
        containerWidth = 880;
        render(<Host initial={makeItems(8)} />);
        close(await openMenu(2));
        await settleTimers();
        expect(screen.queryByRole('button', { name: /^More opened items/ })).toBeNull();
        expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'item-6.md' }));
      });
    }

    it('waits for a delayed guard before moving focus, then lands on the neighbour', async () => {
      containerWidth = 880;
      let allow: (value: boolean) => void = () => undefined;
      render(
        <Host
          initial={makeItems(8)}
          canClose={() => new Promise<boolean>((resolve) => (allow = resolve))}
        />,
      );
      closers['Close menuitem'](await openMenu(2));
      await settleTimers();
      expect(screen.getAllByRole('tab').length).toBe(6);
      await act(async () => allow(true));
      await settleTimers();
      expect(screen.getAllByRole('tab')).toHaveLength(7);
      expect(document.activeElement).not.toBe(document.body);
      expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'item-6.md' }));
    });

    it('leaves the item and focus alone when the guard refuses', async () => {
      containerWidth = 880;
      render(<Host initial={makeItems(8)} canClose={() => Promise.resolve(false)} />);
      closers['Close menuitem'](await openMenu(2));
      await settleTimers();
      expect(screen.getByRole('button', { name: 'More opened items (2)' })).toBeTruthy();
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'More opened items (2)' }),
      );
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
    it('shows the tabs that fit next to a More (N) trigger counting only the hidden ones', () => {
      containerWidth = 700;
      renderTabs({ items: makeItems(8), activeId: 'item-0' });
      expect(screen.getAllByRole('tab')).toHaveLength(5);
      const trigger = screen.getByRole('button', { name: 'More opened items (3)' });
      expect(trigger.textContent).toContain('3');
      expect(trigger.textContent).not.toContain('8');
    });

    it('keeps the active tab visible when it would be hidden', () => {
      containerWidth = 700;
      renderTabs({ items: makeItems(8), activeId: 'item-7' });
      const names = screen.getAllByRole('tab').map((tab) => tab.dataset.itemId);
      expect(names).toContain('item-7');
      expect(names).toHaveLength(5);
    });

    it('recomputes when the container resizes', () => {
      containerWidth = 1200;
      renderTabs({ items: makeItems(8) });
      expect(screen.getAllByRole('tab')).toHaveLength(8);
      expect(screen.queryByRole('button', { name: /^Opened items/ })).toBeNull();
      resize(700);
      expect(screen.getAllByRole('tab')).toHaveLength(5);
    });

    it('offers an accessible Close menuitem per row, for users without a keyboard', async () => {
      containerWidth = 700;
      const { onClose } = renderTabs({ items: makeItems(8) });
      fireEvent.pointerDown(screen.getByRole('button', { name: 'More opened items (3)' }), {
        button: 0,
        ctrlKey: false,
        pointerType: 'mouse',
      });
      const menu = await screen.findByRole('menu');
      expect(within(menu).getAllByRole('menuitem', { name: /^Close / })).toHaveLength(3);
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

    it('lists only the hidden items, with descriptions, in the More menu and activates from it', async () => {
      containerWidth = 700;
      const { onActivate } = renderTabs({ items: makeItems(8) });
      const trigger = screen.getByRole('button', { name: 'More opened items (3)' });
      fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: 'mouse' });
      const menu = await screen.findByRole('menu');
      expect(within(menu).getByText('More opened items')).toBeTruthy();
      const rows = within(menu).getAllByRole('menuitem', { name: /^(?!Close )/ });
      expect(rows.map((row) => row.textContent)).toEqual([
        expect.stringContaining('item-5.md'),
        expect.stringContaining('item-6.md'),
        expect.stringContaining('item-7.md'),
      ]);
      expect(within(menu).queryByText('docs/item-0.md')).toBeNull();
      expect(within(menu).getAllByText('docs/item-7.md')).toHaveLength(1);
      fireEvent.click(rows[2]!);
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

    it('lists every item in one-line rows when none has a description, a pin on the pinned one', async () => {
      renderTabs({
        variant: 'switcher',
        items: [
          makeItem('context', {
            label: 'Context',
            description: undefined,
            icon: undefined,
            closable: false,
          }),
          makeItem('files', { label: 'Files', description: undefined, icon: undefined }),
        ],
        activeId: 'files',
      });
      fireEvent.pointerDown(screen.getByRole('button', { name: /opened$/ }), {
        button: 0,
        ctrlKey: false,
        pointerType: 'mouse',
      });
      const menu = await screen.findByRole('menu');
      expect(within(menu).getByText('Opened items')).toBeTruthy();
      const rows = within(menu).getAllByRole('menuitem', { name: /^(?!Close )/ });
      expect(rows).toHaveLength(2);
      for (const row of rows) {
        // No reserved blank second line under the label.
        expect(row.textContent).not.toContain(' ');
      }

      expect(rows[0]!.querySelector('[title="Close"]')).toBeNull();
      expect(rows[0]!.querySelector('svg')).toBeTruthy();
    });

    it('names the empty state when nothing is active', () => {
      renderTabs({ variant: 'switcher', items: [], activeId: null });
      expect(screen.getByRole('button', { name: 'Opened items (0)' }).textContent).toContain(
        'No item',
      );
    });
  });

  describe('closable: false', () => {
    it('renders no close x for a non-closable item, keeping it otherwise identical', () => {
      renderTabs({
        items: [makeItem('a', { closable: false }), makeItem('b')],
        activeId: 'a',
      });
      expect(screen.queryByRole('button', { name: 'Close a.md' })).toBeNull();
      expect(screen.getByRole('button', { name: 'Close b.md' })).toBeTruthy();
      // Otherwise identical: still a normal, selected, labelled tab.
      const tab = screen.getByRole('tab', { name: 'a.md' });
      expect(tab.getAttribute('aria-selected')).toBe('true');
    });

    it('stays fully keyboard reachable and activatable, but Delete does not close it', () => {
      const { onClose, onActivate } = renderTabs({
        items: [makeItem('a', { closable: false }), makeItem('b')],
        activeId: 'b',
      });
      const tabs = screen.getAllByRole('tab');
      tabs[0]?.focus();
      expect(document.activeElement).toBe(tabs[0]);
      fireEvent.keyDown(tabs[0]!, { key: 'Delete' });
      expect(onClose).not.toHaveBeenCalled();
      fireEvent.click(tabs[0]!);
      expect(onActivate).toHaveBeenCalledWith('a');
    });

    it('does not close on middle-click for a non-closable item', () => {
      const { onClose } = renderTabs({
        items: [makeItem('a', { closable: false }), makeItem('b')],
      });
      const tab = screen.getByRole('tab', { name: 'a.md' });
      fireEvent(tab, new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 }));
      expect(onClose).not.toHaveBeenCalled();
    });

    it('omits the "Close <label>" row from the Opened menu for a non-closable item', async () => {
      // The switcher's menu lists every item, the visible active one included.
      renderTabs({
        variant: 'switcher',
        items: [makeItem('a', { closable: false }), ...makeItems(8)],
      });
      fireEvent.pointerDown(screen.getByRole('button', { name: /opened$/ }), {
        button: 0,
        ctrlKey: false,
        pointerType: 'mouse',
      });
      const menu = await screen.findByRole('menu');
      expect(within(menu).queryByRole('menuitem', { name: 'Close a.md' })).toBeNull();
      expect(within(menu).getByRole('menuitem', { name: 'Close item-0.md' })).toBeTruthy();
      // The row itself (activate, label, description) is still present.
      expect(within(menu).getByRole('menuitem', { name: /^a\.md/ })).toBeTruthy();
    });

    it('works through useOpenedItems: requestClose refuses, the row stays open', async () => {
      function Host() {
        const opened = useOpenedItems<ItemTab>({
          initialItems: [makeItem('a', { closable: false }), makeItem('b')],
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
      expect(screen.queryByRole('button', { name: 'Close a.md' })).toBeNull();
      const tab = screen.getByRole('tab', { name: 'a.md' });
      tab.focus();
      fireEvent.keyDown(tab, { key: 'Delete' });
      await act(async () => {});
      expect(screen.getAllByRole('tab')).toHaveLength(2);
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
