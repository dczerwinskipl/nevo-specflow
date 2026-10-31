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
          component: ({ data }) => <div data-item-page={`${label}:detail`}>{`${data} detail`}</div>,
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

    // The tab's label follows the active page's own title ("Item A detail" once pushed), so the
    // stable `data-item-id` (not the label) identifies which tab is Item A's.
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
