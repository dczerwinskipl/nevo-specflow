// @vitest-environment jsdom
import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from '../shell/AppShell';
import { AppWorkspace, AppWorkspaceSlots } from './AppWorkspace';
import { defineSecondaryStack } from './SecondaryStack';
import {
  AppWorkspaceProvider,
  useRegisterPinnedSecondaryTab,
  useSecondaryNavigation,
  useSecondaryStack,
} from './WorkspaceContext';
import { WorkspaceHeader } from './WorkspaceHeader';

function region(label: string) {
  return { content: <div>{label}</div> };
}

describe('AppWorkspaceSlots', () => {
  it.each([
    ['primary', '75%', '25%'],
    ['balanced', '50%', '50%'],
    ['secondary', '25%', '75%'],
  ] as const)(
    'renders the %s split without changing the public slot order',
    (split, primary, secondary) => {
      const markup = renderToStaticMarkup(
        <AppWorkspaceSlots
          primary={region('Primary')}
          secondary={region('Secondary')}
          split={split}
        />,
      );

      expect(markup.indexOf('Primary')).toBeLessThan(markup.indexOf('Secondary'));
      expect(markup).toContain(`width:${primary}`);
      expect(markup).toContain(`width:${secondary}`);
      expect(markup).toContain('data-design-slot="primary"');
      expect(markup).toContain('data-design-slot="secondary"');
    },
  );

  it('adapts to a single 100% primary region when secondary content is absent', () => {
    const markup = renderToStaticMarkup(
      <AppWorkspaceSlots primary={region('Primary')} split="secondary" />,
    );

    expect(markup).toContain('width:100%');
    expect(markup).not.toContain('data-design-slot="secondary"');
  });
});

describe('AppWorkspace Secondary root-tab strip (workspace-dynamic-split.md §4.1)', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
        unobserve() {}
      },
    );
    // A split-capable width for both AppShell's own layout measurement and ItemTabs' internal
    // strip/switcher measurement, so the strip renders as a full tablist (not the narrow switcher)
    // and the Secondary region renders through the desktop split path, not the stacked/mobile one.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({
      width: 1400,
      height: 56,
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      toJSON: () => ({}),
    }));
    Element.prototype.scrollIntoView ??= () => undefined;
    Element.prototype.scrollTo ??= () => undefined;
    window.scrollTo = () => undefined;
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  interface TabStripPages {
    summary: Record<never, never>;
    detail: Record<never, never>;
    leaf: { name: string };
  }

  function itemStack(id: string, label: string) {
    return defineSecondaryStack<Record<never, never>, string, TabStripPages>({
      id,
      initial: 'summary',
      useData: () => ({ status: 'ready', data: label }),
      screens: {
        summary: {
          title: label,
          component: ({ data }) => {
            const stack = useSecondaryStack<TabStripPages>();

            return (
              <div data-item-page={`${label}:summary`}>
                <p>{`${data} summary`}</p>
                <button type="button" onClick={() => void stack.navTo('detail')}>
                  {`Push ${label} detail`}
                </button>
              </div>
            );
          },
        },
        detail: {
          title: `${label} detail`,
          component: ({ data }) => {
            const stack = useSecondaryStack<TabStripPages>();

            return (
              <div data-item-page={`${label}:detail`}>
                <p>{`${data} detail`}</p>
                <button
                  type="button"
                  onClick={() => void stack.navTo('leaf', { name: 'admission.mjs' })}
                >
                  {`Push ${label} leaf`}
                </button>
              </div>
            );
          },
        },
        leaf: {
          title: 'Tool actions',
          breadcrumbLabel: ({ name }) => `Read file ${name}`,
          component: ({ data }) => <div data-item-page={`${label}:leaf`}>{`${data} leaf`}</div>,
        },
      },
    });
  }

  const itemA = itemStack('test-strip-item-a', 'Item A');
  const itemB = itemStack('test-strip-item-b', 'Item B');

  function TabsHost({ pinned = false }: { pinned?: boolean }) {
    const navigation = useSecondaryNavigation();
    // `AppWorkspace.Secondary` only defines the pinned tab's static content (contract §4.1); a
    // declarative Secondary host still registers it explicitly, as any such host must.
    useRegisterPinnedSecondaryTab(pinned ? { title: 'Context' } : null);

    return (
      <AppWorkspace split="primary">
        <AppWorkspace.Primary header={<WorkspaceHeader title="Primary" />}>
          <button type="button" onClick={() => void navigation.openTab(itemA, {})}>
            openTab A
          </button>
          <button type="button" onClick={() => void navigation.openTab(itemB, {})}>
            openTab B
          </button>
          <button type="button" onClick={() => void navigation.close()}>
            hide secondary
          </button>
        </AppWorkspace.Primary>
        {pinned ? (
          <AppWorkspace.Secondary header={<WorkspaceHeader title="Context" />}>
            <div>Pinned context content</div>
          </AppWorkspace.Secondary>
        ) : null}
      </AppWorkspace>
    );
  }

  function mountTabs(props: { pinned?: boolean } = {}) {
    return render(
      <AppWorkspaceProvider>
        <AppShell navigation={<div>Nav</div>}>
          <TabsHost {...props} />
        </AppShell>
      </AppWorkspaceProvider>,
    );
  }

  const click = async (name: string) => {
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name }));
      await Promise.resolve();
    });
  };

  const secondaryHeader = () =>
    document.querySelector('[data-workspace-surface="secondary"] [data-workspace-header="true"]');

  it('with only the pinned tab open, renders no strip and the header exactly as today', () => {
    mountTabs({ pinned: true });

    expect(document.querySelector('[role="tablist"]')).toBeNull();
    expect(secondaryHeader()?.textContent).toContain('Context');
  });

  it('with nothing open yet and no declarative Secondary, renders no Secondary region at all', () => {
    mountTabs({ pinned: false });

    expect(document.querySelector('[data-workspace-surface="secondary"]')).toBeNull();
    expect(document.querySelector('[role="tablist"]')).toBeNull();
  });

  it('shows the strip once a second tab opens, with no close control on the pinned tab', async () => {
    mountTabs({ pinned: true });

    await click('openTab A');

    const tablist = document.querySelector('[role="tablist"]');
    expect(tablist).not.toBeNull();
    const tabs = within(tablist as HTMLElement).getAllByRole('tab');
    expect(tabs).toHaveLength(2);
    expect(within(tablist as HTMLElement).getByRole('tab', { name: 'Context' })).toBeTruthy();
    expect(within(tablist as HTMLElement).getByRole('tab', { name: 'Item A' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Close Context' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Close Item A' })).toBeTruthy();
  });

  it('closing back down to the pinned tab removes the strip and restores the exact baseline header', async () => {
    mountTabs({ pinned: true });
    const baseline = secondaryHeader()?.outerHTML;
    expect(baseline).toBeTruthy();

    await click('openTab A');
    expect(document.querySelector('[role="tablist"]')).not.toBeNull();

    await click('Close Item A');
    expect(document.querySelector('[role="tablist"]')).toBeNull();
    expect(secondaryHeader()?.outerHTML).toBe(baseline);
  });

  it('with no pinned tab, two openTab tabs both stay closable and closing one leaves no strip and no synthesized pinned tab', async () => {
    mountTabs({ pinned: false });

    await click('openTab A');
    expect(document.querySelector('[role="tablist"]')).toBeNull(); // Still exactly one tab.

    await click('openTab B');
    expect(document.querySelector('[role="tablist"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Close Item A' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Close Item B' })).toBeTruthy();

    await click('Close Item B');
    expect(document.querySelector('[role="tablist"]')).toBeNull();
    expect(screen.getByText('Item A summary')).toBeTruthy();
  });

  it('activating a backgrounded tab via the strip remounts it onto its stored page, not its initial one', async () => {
    mountTabs({ pinned: true });

    await click('openTab A');
    await click('Push Item A detail');
    expect(document.querySelector('[data-item-page="Item A:detail"]')).not.toBeNull();

    await click('openTab B');
    expect(document.querySelector('[data-item-page="Item A:detail"]')).toBeNull();

    const tablist = document.querySelector('[role="tablist"]')!;
    const itemATab = tablist.querySelector<HTMLElement>('[data-item-id="test-strip-item-a"]');
    expect(itemATab).toBeTruthy();

    await act(async () => {
      fireEvent.click(itemATab!);
      await Promise.resolve();
    });

    expect(document.querySelector('[data-item-page="Item A:detail"]')).not.toBeNull();
    expect(document.querySelector('[data-item-page="Item A:summary"]')).toBeNull();
  });

  it('shows no split-layout Back at a tab root while the strip is shown; Back appears only to pop a local stack', async () => {
    mountTabs({ pinned: true });

    await click('openTab A');
    expect(screen.queryByRole('button', { name: /^Back/ })).toBeNull();
    expect(document.querySelector('[data-workspace-breadcrumbs]')).toBeNull();

    await click('Push Item A detail');
    expect(screen.getByRole('button', { name: /^Back/ })).toBeTruthy();

    await click('Back: Item A');
    expect(document.querySelector('[data-item-page="Item A:summary"]')).not.toBeNull();
    expect(screen.queryByRole('button', { name: /^Back/ })).toBeNull();
  });

  it('renders no panel-level close while the strip is shown; each closable tab keeps its own close', async () => {
    mountTabs({ pinned: true });

    await click('openTab A');

    expect(document.querySelector('[role="tablist"]')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Close secondary content' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Close Item A' })).toBeTruthy();
  });

  it('keeps the single panel close when no strip is shown', async () => {
    mountTabs({ pinned: false });
    await click('openTab A');
    expect(document.querySelector('[role="tablist"]')).toBeNull();
    expect(screen.getByRole('button', { name: 'Close secondary content' })).toBeTruthy();
  });

  const breadcrumbs = () => document.querySelector<HTMLElement>('[data-workspace-breadcrumbs]');

  it('keeps each tab labelled by its root at any depth', async () => {
    mountTabs({ pinned: true });

    await click('openTab A');
    await click('Push Item A detail');
    await click('Push Item A leaf');

    const tablist = document.querySelector<HTMLElement>('[role="tablist"]')!;
    expect(within(tablist).getByRole('tab', { name: 'Item A' })).toBeTruthy();
    expect(within(tablist).queryByRole('tab', { name: 'Tool actions' })).toBeNull();
    // The region heading names the tab (its root); the detail's own content heading names the
    // object, so the two never duplicate one heading.
    expect(
      document.querySelector('[data-workspace-surface="secondary"] h2[data-workspace-header-title]')
        ?.textContent,
    ).toBe('Item A');
  });

  it('renders the breadcrumb row as the first child of the tab panel only while deeper than the root', async () => {
    mountTabs({ pinned: true });

    await click('openTab A');
    expect(breadcrumbs()).toBeNull();

    await click('Push Item A detail');
    const row = breadcrumbs()!;
    expect(row).not.toBeNull();
    expect(secondaryHeader()?.contains(row)).toBe(false);
    const panel = row.closest<HTMLElement>('[role="tabpanel"]')!;
    expect(panel.firstElementChild).toBe(row);
    expect(panel.querySelector('[data-item-page="Item A:detail"]')).not.toBeNull();

    // `← Item A › Item A detail`: a one-level Back, the clickable root, the plain current level.
    expect(within(row).getByRole('button', { name: 'Back: Item A' })).toBeTruthy();
    expect(within(row).getByRole('button', { name: 'Item A' })).toBeTruthy();
    const current = row.querySelector('[aria-current="page"]')!;
    expect(current.textContent).toBe('Item A detail');
    expect(current.getAttribute('title')).toBe('Item A detail');
  });

  it('names a level by its breadcrumbLabel and never shows Back or the trail in the rail header', async () => {
    mountTabs({ pinned: true });

    await click('openTab A');
    await click('Push Item A detail');
    await click('Push Item A leaf');

    const row = breadcrumbs()!;
    const segments = [...row.querySelectorAll('li')].map((item) => item.textContent);
    expect(segments).toEqual(['Item A', 'Item A detail', 'Read file admission.mjs']);
    expect(within(secondaryHeader() as HTMLElement).queryByRole('button', { name: /^Back/ })).toBe(
      null,
    );
  });

  it('pops several levels in one step from an ancestor segment, and one level from ←', async () => {
    mountTabs({ pinned: true });

    await click('openTab A');
    await click('Push Item A detail');
    await click('Push Item A leaf');

    await act(async () => {
      fireEvent.click(within(breadcrumbs()!).getByRole('button', { name: 'Item A' }));
      await Promise.resolve();
    });
    expect(document.querySelector('[data-item-page="Item A:summary"]')).not.toBeNull();
    expect(breadcrumbs()).toBeNull();

    await click('Push Item A detail');
    await click('Push Item A leaf');
    await click('Back: Item A detail');
    expect(document.querySelector('[data-item-page="Item A:detail"]')).not.toBeNull();
    expect(breadcrumbs()?.querySelector('[aria-current="page"]')?.textContent).toBe(
      'Item A detail',
    );
  });

  it('sizes the split header as the compact tab rail only while the strip is shown', async () => {
    mountTabs({ pinned: true });
    const headerRow = () =>
      document.querySelector('[data-workspace-surface="secondary"] [data-workspace-tab-rail]');
    expect(headerRow()).toBeNull();

    await click('openTab A');
    expect(headerRow()?.className).toContain('h-tab-rail');
    const strip = document.querySelector('[role="tablist"]')!.parentElement!;
    expect(strip.className).toContain('h-[calc(var(--spacing-tab-rail)-1px)]');

    await click('Close Item A');
    expect(headerRow()).toBeNull();
  });

  it.each([
    [470, 'strip'],
    [340, 'strip'],
    [320, 'switcher'],
  ] as const)(
    'keeps the strip down to a narrower header than ItemTabs’ 480px default (%ipx -> %s)',
    async (stripWidth, expected) => {
      // Only the ItemTabs root (the 38px tab-rail row) reports the narrow width; everything else
      // keeps the split-capable 1400px so the region still renders through the desktop path.
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
        this: HTMLElement,
      ) {
        const width = this.className.includes('h-[calc(var(--spacing-tab-rail)-1px)]')
          ? stripWidth
          : 1400;

        return {
          width,
          height: 56,
          x: 0,
          y: 0,
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          toJSON: () => ({}),
        };
      });
      mountTabs({ pinned: true });

      await click('openTab A');
      await click('openTab B');

      if (expected === 'strip') {
        expect(document.querySelector('[role="tablist"]')).not.toBeNull();
      } else {
        expect(document.querySelector('[role="tablist"]')).toBeNull();
        expect(screen.getByRole('button', { name: 'Item B, 3 opened' })).toBeTruthy();
      }
    },
  );

  it('marks the tab whose content is actually shown as selected after the runtime region is hidden', async () => {
    mountTabs({ pinned: true });

    await click('openTab A');
    await click('hide secondary');

    // The runtime region is hidden (contract §9.3); the pinned content is what renders now.
    expect(screen.getByText('Pinned context content')).toBeTruthy();
    const tablist = document.querySelector<HTMLElement>('[role="tablist"]')!;
    expect(
      within(tablist).getByRole('tab', { name: 'Context' }).getAttribute('aria-selected'),
    ).toBe('true');
    expect(within(tablist).getByRole('tab', { name: 'Item A' }).getAttribute('aria-selected')).toBe(
      'false',
    );
    // The region keeps a heading naming the shown tab (the strip itself is not a heading).
    expect(
      document.querySelector('[data-workspace-surface="secondary"] h2[data-workspace-header-title]')
        ?.textContent,
    ).toBe('Context');
  });
});

describe('AppWorkspace secondarySide (workspace-dynamic-split.md §4.2 last bullet, W06)', () => {
  // Each region's content captures a mount-only id (the `useState` initializer runs exactly once
  // per mount lifecycle, unlike a counter incremented in the component body, which would also tick
  // on an ordinary re-render and falsely look like a remount). A true remount across the swap would
  // produce a new id; a stable id proves React reused the same instance (contract: "MUST NOT
  // remount Primary, any tab, or any tab's content").
  let nextMountId = 0;
  let mountIds: Record<string, number>;

  function PrimaryContent() {
    const [id] = useState(() => ++nextMountId);
    mountIds.primary = id;

    return <div>Primary content</div>;
  }

  function SecondaryContent() {
    const [id] = useState(() => ++nextMountId);
    mountIds.secondary = id;

    return <div>Secondary content</div>;
  }

  function SwapHost({ initialSide = 'end' }: { initialSide?: 'start' | 'end' } = {}) {
    const [side, setSide] = useState<'start' | 'end'>(initialSide);

    return (
      <AppWorkspace secondarySide={side} split="balanced">
        <AppWorkspace.Primary header={<WorkspaceHeader title="Primary" />}>
          <PrimaryContent />
          <button onClick={() => setSide(side === 'end' ? 'start' : 'end')} type="button">
            Swap sides
          </button>
        </AppWorkspace.Primary>
        <AppWorkspace.Secondary header={<WorkspaceHeader title="Secondary" />}>
          <SecondaryContent />
        </AppWorkspace.Secondary>
      </AppWorkspace>
    );
  }

  function mountSwapHost(props?: { initialSide?: 'start' | 'end' }) {
    mountIds = {};

    return render(
      <AppShell navigation={<div>Nav</div>}>
        <SwapHost {...props} />
      </AppShell>,
    );
  }

  function surfaceOrder() {
    return [...document.querySelectorAll('[data-workspace-surface]')].map((el) =>
      el.getAttribute('data-workspace-surface'),
    );
  }

  function dividerClasses(surfaceName: 'primary' | 'secondary') {
    const el = document.querySelector(`[data-workspace-surface="${surfaceName}"]`);

    return el?.className.split(/\s+/) ?? [];
  }

  beforeEach(() => {
    nextMountId = 0;
    // Needed unconditionally (AppShell's measurement, ScrollArea, and the stacked mobile runtime
    // all observe an element) regardless of which nested scenario below also mocks the measured
    // width itself.
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
        unobserve() {}
      },
    );
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('in a split layout (fixed preset, not split="dynamic" — the swap is not gated to it)', () => {
    beforeEach(() => {
      // A split-capable width (> WORKSPACE_SPLIT_MIN_WIDTH) so `balanced` resolves `state.mode ===
      // 'split'`, where secondarySide has its only visible effect.
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({
        width: 1400,
        height: 56,
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        toJSON: () => ({}),
      }));
    });

    it("defaults to Secondary after Primary, divider on Secondary's leading edge", () => {
      mountSwapHost();

      expect(surfaceOrder()).toEqual(['primary', 'secondary']);
      expect(dividerClasses('secondary')).toContain('border-l');
      expect(dividerClasses('secondary')).not.toContain('border-r');
    });

    it('swapping to the start side reorders the DOM and flips the divider, without remounting either region', async () => {
      mountSwapHost();
      const idsBefore = { ...mountIds };

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Swap sides' }));
        await Promise.resolve();
      });

      expect(surfaceOrder()).toEqual(['secondary', 'primary']);
      expect(dividerClasses('secondary')).toContain('border-r');
      expect(dividerClasses('secondary')).not.toContain('border-l');
      // Stable identity across the swap: neither region's content remounted (a remount would mint
      // a new id from the shared `nextMountId` counter).
      expect(mountIds).toEqual(idsBefore);
    });

    it('swapping back to the end side restores the original order and divider', async () => {
      mountSwapHost({ initialSide: 'start' });
      expect(surfaceOrder()).toEqual(['secondary', 'primary']);
      const idsBefore = { ...mountIds };

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Swap sides' }));
        await Promise.resolve();
      });

      expect(surfaceOrder()).toEqual(['primary', 'secondary']);
      expect(dividerClasses('secondary')).toContain('border-l');
      expect(mountIds).toEqual(idsBefore);
    });
  });

  it("has no visible effect in a stacked layout (jsdom's unmeasured width renders stacked by default)", async () => {
    mountSwapHost({ initialSide: 'start' });

    // Only one surface is visible/mounted at a time in a stacked layout, and `secondarySide`'s
    // only effect is reordering two simultaneously-visible split-layout siblings — so a stacked
    // render is unaffected regardless of which side is named.
    expect(document.querySelector('[data-layout="stacked"]')).not.toBeNull();
    const idsBefore = { ...mountIds };

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Swap sides', hidden: true }));
      await Promise.resolve();
    });

    expect(document.querySelector('[data-layout="stacked"]')).not.toBeNull();
    expect(mountIds).toEqual(idsBefore);
  });
});

describe('AppWorkspace stacked Secondary header (unchanged by the split breadcrumb row)', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
        unobserve() {}
      },
    );
    Element.prototype.scrollIntoView ??= () => undefined;
    Element.prototype.scrollTo ??= () => undefined;
    window.scrollTo = () => undefined;
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const stack = defineSecondaryStack<
    Record<never, never>,
    string,
    { detail: Record<never, never> }
  >({
    id: 'test-stacked-item',
    initial: 'summary' as never,
    useData: () => ({ status: 'ready', data: 'x' }),
    screens: {
      summary: {
        title: 'Item',
        component: function Summary() {
          const stack = useSecondaryStack<{ detail: Record<never, never> }>();

          return (
            <button type="button" onClick={() => void stack.navTo('detail')}>
              push detail
            </button>
          );
        },
      },
      detail: { title: 'Item detail', component: () => <div>detail</div> },
    } as never,
  });

  function Host() {
    const navigation = useSecondaryNavigation();
    useRegisterPinnedSecondaryTab({ title: 'Context' });

    return (
      <AppWorkspace split="primary">
        <AppWorkspace.Primary header={<WorkspaceHeader title="Primary" />}>
          <button type="button" onClick={() => void navigation.openTab(stack, {})}>
            openTab
          </button>
        </AppWorkspace.Primary>
        <AppWorkspace.Secondary header={<WorkspaceHeader title="Context" />}>
          <div>Pinned context content</div>
        </AppWorkspace.Secondary>
      </AppWorkspace>
    );
  }

  it('keeps Back and the panel close in the header and renders no split breadcrumb row', async () => {
    render(
      <AppWorkspaceProvider>
        <AppShell navigation={<div>Nav</div>}>
          <Host />
        </AppShell>
      </AppWorkspaceProvider>,
    );
    expect(document.querySelector('[data-layout="stacked"]')).not.toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'openTab', hidden: true }));
      await Promise.resolve();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'push detail', hidden: true }));
      await Promise.resolve();
    });

    const secondary = document.querySelector('[data-workspace-surface="secondary"]');
    expect(secondary).not.toBeNull();
    expect(
      within(secondary as HTMLElement).getAllByRole('button', { name: 'Back', hidden: true })[0],
    ).toBeTruthy();
    expect(
      within(secondary as HTMLElement).getByRole('button', {
        name: 'Close secondary content',
        hidden: true,
      }),
    ).toBeTruthy();
    // Mobile keeps its own navigation: header Back, no breadcrumb row, the 56px header (no rail).
    expect(document.querySelector('[data-workspace-breadcrumbs]')).toBeNull();
    expect(document.querySelector('[data-workspace-tab-rail]')).toBeNull();
  });

  it('keeps Primary at the full width while a dynamic-split Secondary slides over it', async () => {
    // A phone width: the dynamic resolver stacks, so Secondary covers Primary instead of sharing
    // the row. Primary used to be sized by the split ratio's leftover (~45px of 375px) during the
    // whole slide-in.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({
      width: 375,
      height: 812,
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 375,
      bottom: 812,
      toJSON: () => ({}),
    }));
    function DynamicHost() {
      const navigation = useSecondaryNavigation();
      useRegisterPinnedSecondaryTab({ title: 'Context' });

      return (
        <AppWorkspace split="dynamic">
          <AppWorkspace.Primary header={<WorkspaceHeader title="Primary" />}>
            <button type="button" onClick={() => void navigation.openTab(stack, {})}>
              openTab
            </button>
          </AppWorkspace.Primary>
          <AppWorkspace.Secondary header={<WorkspaceHeader title="Context" />}>
            <div>Pinned context content</div>
          </AppWorkspace.Secondary>
        </AppWorkspace>
      );
    }

    render(
      <AppWorkspaceProvider>
        <AppShell navigation={<div>Nav</div>}>
          <DynamicHost />
        </AppShell>
      </AppWorkspaceProvider>,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'openTab', hidden: true }));
      await Promise.resolve();
    });

    expect(document.querySelector('[data-layout="stacked"]')).not.toBeNull();
    expect(document.querySelector('[data-workspace-surface="secondary"]')).not.toBeNull();
    const primary = document.querySelector<HTMLElement>('[data-workspace-surface="primary"]');
    const maxWidth = primary?.style.maxWidth ?? '';
    expect(maxWidth === '100%' || Number.parseFloat(maxWidth) >= 375).toBe(true);
  });
});
