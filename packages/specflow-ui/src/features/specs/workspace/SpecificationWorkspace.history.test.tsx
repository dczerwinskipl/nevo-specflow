// @vitest-environment jsdom
import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from '@nevo/ui';
import { QueryClientProvider } from '@tanstack/react-query';
import { createSpecFlowQueryClient } from '../../../app/queryClient';
import { createSpecFlowAppServices } from '../../../services';
import { TestServicesRouterContext } from '../../../../test-support/app/TestServicesRouterContext';
import { UiModulesProvider } from '../../../app/ui-modules/UiModulesProvider';
import { builtInUiModuleRegistry } from '../../../app/ui-modules/builtInUiModules';
import { LocalizationProvider, createSpecFlowI18n } from '../../../i18n';
import { createSpecificationWorkspaceFixture } from '../../../../test-support/specs/workspace/fixtures';
import type { SpecificationWorkspaceData } from '../read-model/model';
import { SpecificationStateProvider } from '../SpecificationStateProvider';
import { SpecificationWorkspace } from './SpecificationWorkspace';

/** The measured width of every element: split-capable unless a test narrows it. */
let width = 1600;

beforeEach(() => {
  width = 1600;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = () => undefined;
      unobserve = () => undefined;
      disconnect = () => undefined;
    },
  );
  // A split-capable workspace: the declarative Secondary can show beside Overview.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    () => ({ width, height: 900, x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0 }) as DOMRect,
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const withHistory = createSpecificationWorkspaceFixture('working', 'SPEC-1');
const emptyHistory: SpecificationWorkspaceData = { ...withHistory, activityEvents: [] };

function Workspace({
  data,
  specId = 'SPEC-1',
}: {
  readonly data: SpecificationWorkspaceData;
  readonly specId?: string;
}) {
  const [setup] = useState(() => ({
    query: createSpecFlowQueryClient(),
    services: createSpecFlowAppServices({}),
  }));

  return (
    <QueryClientProvider client={setup.query}>
      <TestServicesRouterContext services={setup.services}>
        <UiModulesProvider modules={builtInUiModuleRegistry}>
          <LocalizationProvider instance={createSpecFlowI18n('en')}>
            <AppShell navigation={<div>Navigation</div>}>
              <SpecificationWorkspace specId={specId} data={data} />
            </AppShell>
          </LocalizationProvider>
        </UiModulesProvider>
      </TestServicesRouterContext>
    </QueryClientProvider>
  );
}

/** The visit outlives the Overview: `route` swaps it for another screen, as navigation does. */
function Visit({
  route,
  data,
  specId,
}: {
  readonly route: 'overview' | 'documents';
  readonly data: SpecificationWorkspaceData;
  readonly specId?: string;
}) {
  return (
    <SpecificationStateProvider>
      {route === 'overview' ? <Workspace data={data} specId={specId} /> : <p>Documents screen</p>}
    </SpecificationStateProvider>
  );
}

function historyPanel() {
  return screen.queryByRole('heading', { level: 2, name: 'Activity history' });
}

function historyToggle() {
  return screen.getByRole('button', { name: 'Activity history' });
}

describe('Specification Overview Activity history', () => {
  it('does not open the Secondary for an empty history and offers it on demand', () => {
    render(<Workspace data={emptyHistory} />);

    expect(historyPanel()).toBeNull();
    expect(historyToggle().getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(historyToggle());

    expect(historyPanel()).not.toBeNull();
    expect(historyToggle().getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('No history for this specification')).not.toBeNull();
  });

  it('keeps a history the user opened open while it stays empty', () => {
    const { rerender } = render(<Workspace data={emptyHistory} />);
    fireEvent.click(historyToggle());

    // A refresh delivers a new, still empty, read model.
    rerender(<Workspace data={{ ...emptyHistory, activityEvents: [] }} />);

    expect(historyPanel()).not.toBeNull();
  });

  it('opens the Secondary by default when the history has entries', () => {
    render(<Workspace data={withHistory} />);

    expect(historyPanel()).not.toBeNull();
    expect(historyToggle().getAttribute('aria-pressed')).toBe('true');
  });

  it('keeps the Secondary closed for the Specification-created event alone, open with a Session event', () => {
    const created = {
      id: 'specification-created',
      kind: 'info' as const,
      time: '2026-11-08',
      title: 'Specification created',
      description: '',
    };
    const { unmount } = render(<Workspace data={{ ...withHistory, activityEvents: [created] }} />);

    expect(historyPanel()).toBeNull();
    fireEvent.click(historyToggle());
    // On demand it shows the localized event and its calendar date, without a time-zone shift.
    expect(screen.getByText('Specification created')).not.toBeNull();
    expect(screen.getByText('Nov 8, 2026')).not.toBeNull();
    unmount();

    const started = {
      id: 'session-started.s-1',
      kind: 'session' as const,
      targetId: 's-1',
      time: new Date(Date.now() - 5 * 60_000).toISOString(),
      title: '',
      description: 'Session started',
    };
    render(
      <Workspace data={{ ...withHistory, activityEvents: [started, created] }} specId="SPEC-2" />,
    );

    expect(historyPanel()).not.toBeNull();
    expect(screen.getByText('Untitled session')).not.toBeNull();
    // The Continue session row shows its own relative time as well.
    expect(screen.getAllByText('5 minutes ago').length).toBeGreaterThan(0);
    expect(screen.queryByText(started.time)).toBeNull();
  });

  it('never opens or closes the panel because the history changed', () => {
    const { rerender } = render(<Workspace data={withHistory} />);
    rerender(<Workspace data={emptyHistory} />);
    expect(historyPanel()).not.toBeNull();

    fireEvent.click(historyToggle());
    expect(historyPanel()).toBeNull();
    rerender(<Workspace data={withHistory} />);
    expect(historyPanel()).toBeNull();
  });

  it('keeps a history the user opened open after leaving the Overview and coming back', () => {
    const { rerender } = render(<Visit route="overview" data={emptyHistory} />);
    fireEvent.click(historyToggle());

    rerender(<Visit route="documents" data={emptyHistory} />);
    expect(historyPanel()).toBeNull();
    rerender(<Visit route="overview" data={emptyHistory} />);

    expect(historyPanel()).not.toBeNull();
    expect(historyToggle().getAttribute('aria-pressed')).toBe('true');
  });

  it('keeps a history with entries the user closed closed after the round trip', () => {
    const { rerender } = render(<Visit route="overview" data={withHistory} />);
    fireEvent.click(historyToggle());
    expect(historyPanel()).toBeNull();

    rerender(<Visit route="documents" data={withHistory} />);
    rerender(<Visit route="overview" data={withHistory} />);

    expect(historyPanel()).toBeNull();
  });

  it('applies a choice to its own Specification only', () => {
    const other = { ...withHistory, id: 'SPEC-2' };
    const { rerender } = render(<Visit route="overview" data={withHistory} />);
    fireEvent.click(historyToggle());
    expect(historyPanel()).toBeNull();

    // Another Specification without a choice takes the default: open, it has entries.
    rerender(<Visit route="overview" specId="SPEC-2" data={other} />);
    expect(historyPanel()).not.toBeNull();
    rerender(<Visit route="overview" specId="SPEC-2" data={{ ...other, activityEvents: [] }} />);
    rerender(<Visit route="documents" data={other} />);
    rerender(<Visit route="overview" specId="SPEC-2" data={{ ...other, activityEvents: [] }} />);
    // Remounted without a choice: an empty history now stays closed by default.
    expect(historyPanel()).toBeNull();

    rerender(<Visit route="overview" data={withHistory} />);
    expect(historyPanel()).toBeNull();
  });

  it('brings the history forward from behind a document preview', async () => {
    render(<Workspace data={withHistory} />);
    expect(historyPanel()).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Specyfikacja' }));
    await act(() => Promise.resolve());
    // The preview covers the history: the toggle no longer reads as pressed.
    expect(historyPanel()).toBeNull();
    expect(historyToggle().getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(historyToggle());
    await act(() => Promise.resolve());

    expect(historyPanel()).not.toBeNull();
    expect(historyToggle().getAttribute('aria-pressed')).toBe('true');
  });

  it('opens the history from the header menu on a narrow workspace', async () => {
    width = 600;
    render(<Workspace data={emptyHistory} />);
    // No split: no declarative Secondary and no toggle, the action sits in the "More actions" menu.
    expect(historyPanel()).toBeNull();
    expect(screen.queryByRole('button', { name: 'Activity history' })).toBeNull();

    fireEvent.keyDown(screen.getByRole('button', { name: 'More actions' }), { key: 'Enter' });
    const menu = screen.getByRole('menu');
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Activity history' }));
    await act(() => Promise.resolve());

    expect(await screen.findByText('No history for this specification')).not.toBeNull();
  });
});
