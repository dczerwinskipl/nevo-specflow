// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppShell, AppWorkspaceProvider, useSecondaryNavigation } from '@nevo/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalizationProvider, createSpecFlowI18n } from '../../../i18n';
import { installWorkspaceWidth } from '../../../test-support/workspaceWidth.test-support';
import type { ManagedSessionsApi } from './api';
import { ManagedSession } from './ManagedSession';
import { fixtureSessionId } from './managedSession.stories-support';
import { workSummaryStatesApi } from './managedSession.fullSession.stories-support';

let width: ReturnType<typeof installWorkspaceWidth>;
beforeEach(() => {
  Element.prototype.scrollIntoView = () => undefined;
  Element.prototype.scrollTo = () => undefined;
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => undefined;
  window.scrollTo = () => undefined;
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: () => false,
    onchange: null,
  }));
});
afterEach(() => {
  cleanup();
  sessionStorage.clear();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Lists the Secondary tabs the provider holds, so a test can count them. */
function TabProbe() {
  const { tabs, isOpen } = useSecondaryNavigation();

  return (
    <output data-testid="tabs" data-visible={String(isOpen)} data-active={tabs.activeTabId ?? ''}>
      {tabs.tabs.map((tab) => tab.title).join('|')}
    </output>
  );
}

function renderSession(api: ManagedSessionsApi, initialWidth: number) {
  width = installWorkspaceWidth(initialWidth);

  return render(
    <LocalizationProvider instance={createSpecFlowI18n('en')}>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <AppShell navigation={<div>Navigation</div>}>
          <AppWorkspaceProvider>
            <TabProbe />
            <ManagedSession sessionId={fixtureSessionId} owner="owner-1" api={api} />
          </AppWorkspaceProvider>
        </AppShell>
      </QueryClientProvider>
    </LocalizationProvider>,
  );
}

const tabs = () => screen.getByTestId('tabs').textContent;
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

describe('N-D1 the first snapshot failed', () => {
  it('Context shows no skeleton forever: Work and the executor are unreadable', async () => {
    const api = {
      ...workSummaryStatesApi(),
      snapshot: () => Promise.reject(new Error('Runtime down')),
    } as ManagedSessionsApi;
    renderSession(api, 1400);

    await waitFor(() =>
      expect(screen.getAllByText('Couldn’t load the work history.').length).toBeGreaterThan(0),
    );
    expect(screen.getAllByText('Couldn’t load executor details.').length).toBeGreaterThan(0);
    expect(document.querySelector('section[aria-busy="true"]')).toBeNull();
  });
});

describe('N5 Work opens by the owner scheme, not by the resolved layout', () => {
  it('opening the same Turn twice at 780px (mobile scheme) is one flow, never two tabs', async () => {
    renderSession(workSummaryStatesApi(), 780);
    const blocks = await waitFor(() => {
      const found = document.querySelectorAll<HTMLElement>('[data-work-block] button');
      expect(found.length).toBeGreaterThan(0);

      return found;
    });

    fireEvent.click(blocks[0]!);
    await settle();
    fireEvent.click(document.querySelectorAll<HTMLElement>('[data-work-block] button')[0]!);
    await settle();

    // The runtime flow (`open`) is one slot: a second tab would list two entries.
    expect(tabs().split('|').filter(Boolean)).toHaveLength(1);
    expect(screen.getByTestId('tabs').dataset.visible).toBe('true');
  });

  it('from 840px the same Turn is one root tab beside the pinned Context', async () => {
    renderSession(workSummaryStatesApi(), 1400);
    await waitFor(() =>
      expect(document.querySelectorAll('[data-work-block] button').length).toBeGreaterThan(0),
    );

    fireEvent.click(document.querySelectorAll<HTMLElement>('[data-work-block] button')[0]!);
    await settle();
    fireEvent.click(document.querySelectorAll<HTMLElement>('[data-work-block] button')[0]!);
    await settle();

    const titles = tabs().split('|');
    expect(titles[0]).toBe('Context');
    expect(titles).toHaveLength(2);
  });
});

describe('N1 a narrow Context flow does not become a second Context tab', () => {
  it('widening past 840px leaves only the pinned Context tab', async () => {
    renderSession(workSummaryStatesApi(), 600);
    fireEvent.click(await screen.findByRole('button', { name: 'Context' }));
    await settle();
    expect(tabs()).toBe('Context');

    await width.setWidth(1400);
    await settle();

    expect(tabs()).toBe('Context');
    expect(screen.getByTestId('tabs').dataset.active).toBe('$workspace-pinned$');
  });
});

describe('N4 narrowing below 840px follows the mobile scheme', () => {
  it('Context active with a Work tab in the background: the panel hides instead of sliding Work over the conversation', async () => {
    renderSession(workSummaryStatesApi(), 1400);
    await waitFor(() =>
      expect(document.querySelectorAll('[data-work-block] button').length).toBeGreaterThan(0),
    );
    fireEvent.click(document.querySelectorAll<HTMLElement>('[data-work-block] button')[0]!);
    await settle();
    fireEvent.click(screen.getByRole('tab', { name: 'Context' }));
    await settle();
    expect(screen.getByTestId('tabs').dataset.active).toBe('$workspace-pinned$');

    await width.setWidth(780);
    await settle();

    // Owner decision (2026-11-04): nothing opens without the user; Work stays in the background.
    expect(screen.getByTestId('tabs').dataset.visible).toBe('false');
    expect(document.querySelector('[data-workspace-surface="secondary"]')).toBeNull();
  });
});

describe('N2 the side-panel toggle hides the whole panel and restores what was active', () => {
  it('Context active with a Work tab in the background: one press hides all, the next shows Context', async () => {
    renderSession(workSummaryStatesApi(), 1400);
    await waitFor(() =>
      expect(document.querySelectorAll('[data-work-block] button').length).toBeGreaterThan(0),
    );
    fireEvent.click(document.querySelectorAll<HTMLElement>('[data-work-block] button')[0]!);
    await settle();
    // Back to Context: the Work tab waits in the background.
    fireEvent.click(screen.getByRole('tab', { name: 'Context' }));
    await settle();
    expect(screen.getByTestId('tabs').dataset.active).toBe('$workspace-pinned$');

    const toggle = screen.getByRole('button', { name: 'Side panel' });
    fireEvent.click(toggle);
    await settle();
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByTestId('tabs').dataset.visible).toBe('false');
    expect(screen.getByTestId('tabs').dataset.active).toBe('');

    fireEvent.click(toggle);
    await settle();
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('tabs').dataset.active).toBe('$workspace-pinned$');
  });

  it('a Work tab active: hiding remembers it and showing activates it again', async () => {
    renderSession(workSummaryStatesApi(), 1400);
    await waitFor(() =>
      expect(document.querySelectorAll('[data-work-block] button').length).toBeGreaterThan(0),
    );
    fireEvent.click(document.querySelectorAll<HTMLElement>('[data-work-block] button')[0]!);
    await settle();
    const workTab = screen.getByTestId('tabs').dataset.active;
    expect(workTab).not.toBe('$workspace-pinned$');

    const toggle = screen.getByRole('button', { name: 'Side panel' });
    fireEvent.click(toggle);
    await settle();
    expect(screen.getByTestId('tabs').dataset.visible).toBe('false');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(toggle);
    await settle();
    expect(screen.getByTestId('tabs').dataset.active).toBe(workTab);
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
  });
});
