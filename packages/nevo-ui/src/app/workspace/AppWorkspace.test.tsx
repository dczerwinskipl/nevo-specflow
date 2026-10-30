// @vitest-environment jsdom
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
