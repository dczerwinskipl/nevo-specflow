// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createSpecFlowQueryClient } from '../../../app/queryClient';
import { createSpecFlowAppServices } from '../../../services';
import { TestServicesRouterContext } from '../../../../test-support/app/TestServicesRouterContext';
import { UiModulesProvider } from '../../../app/ui-modules/UiModulesProvider';
import { builtInUiModuleRegistry } from '../../../app/ui-modules/builtInUiModules';
import { LocalizationProvider, createSpecFlowI18n } from '../../../i18n';
import { createSpecificationWorkspaceFixture } from '../../../../test-support/specs/workspace/fixtures';
import type { SpecificationWorkspaceData } from '../read-model/model';
import { createFakeWorkspaceRuntime, WorkspaceProvider } from './WorkspaceContext';
import { OVERVIEW_TWO_COLUMN_MIN_WIDTH, WorkView } from './WorkView';

/** Documents reads the archetype catalogue (type titles) through the app services and Query. */
function TestProviders({ children }: { readonly children: ReactNode }) {
  const [setup] = useState(() => ({
    query: createSpecFlowQueryClient(),
    services: createSpecFlowAppServices({}),
  }));

  return (
    <QueryClientProvider client={setup.query}>
      <TestServicesRouterContext services={setup.services}>
        <UiModulesProvider modules={builtInUiModuleRegistry}>{children}</UiModulesProvider>
      </TestServicesRouterContext>
    </QueryClientProvider>
  );
}

let contentWidth = 0;
let resizeCallbacks: ResizeObserverCallback[] = [];

beforeEach(() => {
  resizeCallbacks = [];
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: ResizeObserverCallback) {
        resizeCallbacks.push(callback);
      }
      observe = () => undefined;
      unobserve = () => undefined;
      disconnect = () => undefined;
    },
  );
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    () =>
      ({
        width: contentWidth,
        height: 0,
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

function renderWorkView(width: number, data = createSpecificationWorkspaceFixture('working')) {
  contentWidth = width;

  return render(
    <TestProviders>
      <LocalizationProvider instance={createSpecFlowI18n('en')}>
        <WorkspaceProvider runtime={createFakeWorkspaceRuntime()}>
          <WorkView data={data} />
        </WorkspaceProvider>
      </LocalizationProvider>
    </TestProviders>,
  );
}

function resizeTo(width: number) {
  contentWidth = width;
  act(() => {
    for (const callback of resizeCallbacks) {
      callback([], {} as ResizeObserver);
    }
  });
}

function columns(container: HTMLElement) {
  return container.querySelector<HTMLElement>('[data-overview-columns]')?.dataset.overviewColumns;
}

/** The region headings in DOM (reading and keyboard) order. */
function headingOrder(container: HTMLElement) {
  return [...container.querySelectorAll('h2, h3')]
    .map((heading) => heading.textContent ?? '')
    .filter((text) => /Requires your attention|Sessions|Tasks|Documents/.test(text))
    .map((text) => text.replace(/\d.*$/, '').trim());
}

function withoutAttention(data: SpecificationWorkspaceData): SpecificationWorkspaceData {
  return {
    ...data,
    attentionItems: [],
    featureAttention: {
      tasks: { state: 'available', items: [] },
      sessions: { state: 'available', items: [] },
      git: { state: 'available', items: [] },
    },
  };
}

describe('Specification Overview columns', () => {
  it('keeps one reading column below 1408 px of content width and splits from 1408 px', () => {
    expect(OVERVIEW_TWO_COLUMN_MIN_WIDTH).toBe(1408);

    const narrow = renderWorkView(1407);
    expect(columns(narrow.container)).toBe('1');
    cleanup();

    const wide = renderWorkView(1408);
    expect(columns(wide.container)).toBe('2');
  });

  it('reads in priority order in one column and work column first in two columns', () => {
    const { container } = renderWorkView(1200);
    const order = ['Requires your attention', 'Tasks', 'Sessions', 'Documents'];
    expect(headingOrder(container)).toEqual(order);

    resizeTo(1600);
    expect(headingOrder(container)).toEqual(order);
    const context = container.querySelector('[data-overview-column="context"]');
    expect(context?.querySelector('#resume-heading')).not.toBeNull();
    expect(context?.querySelector('#documents-summary-heading')).not.toBeNull();
    expect(context?.querySelector('#tasks-summary-heading')).toBeNull();
  });

  it('lets Tasks open the work column when nothing requires attention', () => {
    const { container } = renderWorkView(
      1600,
      withoutAttention(createSpecificationWorkspaceFixture('working')),
    );

    expect(headingOrder(container)[0]).toBe('Tasks');
    const tasks = container
      .querySelector('#tasks-summary-heading')
      ?.closest<HTMLElement>('[class*="col-start-1"]');
    // The slot's first section drops its divider: it opens the column.
    expect(tasks?.className).toContain('[&>*:first-child]:border-t-0');
  });

  it('shows Documents first in the context column without a Session', () => {
    const data = createSpecificationWorkspaceFixture('no-git');
    const { container } = renderWorkView(1600, { ...data, resumeSession: undefined, sessions: [] });
    const context = container.querySelector('[data-overview-column="context"]');

    expect(context?.firstElementChild?.querySelector('#documents-summary-heading')).not.toBeNull();
    expect(container.querySelector('#resume-heading')).toBeNull();
  });

  it('moves the work sections across the breakpoint without remounting them', () => {
    const { container } = renderWorkView(1600);
    const tasks = container.querySelector('#tasks-summary-heading');
    expect(tasks).not.toBeNull();

    resizeTo(1000);
    expect(columns(container)).toBe('1');
    expect(container.querySelector('#tasks-summary-heading')).toBe(tasks);
  });

  it('stays one column at any width when no context section shows', () => {
    const data = createSpecificationWorkspaceFixture('no-git');
    const { container } = renderWorkView(2400, {
      ...data,
      resumeSession: undefined,
      sessions: [],
      sectionAvailability: { documents: 'unavailable' },
    });

    expect(columns(container)).toBe('1');
    expect(container.querySelector('[data-overview-column="context"]')).toBeNull();
    expect(container.querySelector('#tasks-summary-heading')).not.toBeNull();
  });

  it('opens the context column with Sessions, then Documents, in a Specification with Git', () => {
    const data = createSpecificationWorkspaceFixture('working');
    expect(data.hasGit && data.repoContext).toBeTruthy();
    const { container } = renderWorkView(1600, data);
    const context = container.querySelector('[data-overview-column="context"]');

    expect(context?.firstElementChild?.querySelector('#resume-heading')).not.toBeNull();
    const sections = [...(context?.children ?? [])].map(
      (section) => section.querySelector('h3')?.textContent ?? '',
    );
    expect(sections[0]).toMatch(/^Sessions/);
    expect(sections[1]).toMatch(/^Documents/);
    expect(sections.slice(2).join(' ')).toMatch(/Repository/);
  });

  it('stays one column at any width when no work section shows', () => {
    // An empty Specification with a Session and no Tasks: no attention, no preparation (a
    // Session owns the next step), no Tasks summary; only context sections.
    const working = withoutAttention(createSpecificationWorkspaceFixture('working'));
    const { container } = render(
      <TestProviders>
        <LocalizationProvider instance={createSpecFlowI18n('en')}>
          <WorkspaceProvider runtime={createFakeWorkspaceRuntime()}>
            <WorkView
              data={{ ...working, isEmpty: true, taskOverview: { rows: [], compact: [] } }}
            />
          </WorkspaceProvider>
        </LocalizationProvider>
      </TestProviders>,
    );
    contentWidth = 2400;
    resizeTo(2400);

    expect(container.querySelector('#tasks-summary-heading')).toBeNull();
    expect(container.querySelector('#preparation-heading')).toBeNull();
    // The context side alone would fill a column: the repository is there.
    expect([...container.querySelectorAll('h3')].map((h) => h.textContent)).toContain('Repository');
    expect(columns(container)).toBe('1');
  });
});

describe('Specification Overview without Tasks', () => {
  /** An empty Specification as project mode reads it: Tasks available and empty, documents. */
  function emptySpecification(
    overrides: Partial<SpecificationWorkspaceData> = {},
  ): SpecificationWorkspaceData {
    const base = createSpecificationWorkspaceFixture('empty');
    const working = createSpecificationWorkspaceFixture('working');

    return {
      ...base,
      documents: working.documents,
      sectionAvailability: { tasks: 'available', documents: 'available', sessions: 'available' },
      startSession: { available: true },
      ...overrides,
    };
  }

  function renderEmpty(data: SpecificationWorkspaceData, openNewSession = vi.fn()) {
    contentWidth = 1200;
    const view = render(
      <TestProviders>
        <LocalizationProvider instance={createSpecFlowI18n('en')}>
          <WorkspaceProvider runtime={createFakeWorkspaceRuntime({ openNewSession })}>
            <WorkView data={data} />
          </WorkspaceProvider>
        </LocalizationProvider>
      </TestProviders>,
    );

    return { ...view, openNewSession };
  }

  it('shows the description, the preparation block opening New Session and Documents', () => {
    const { container, openNewSession } = renderEmpty(emptySpecification());

    expect(screen.getByText(/Utrzymać kontekst pracy/u)).not.toBeNull();
    expect(container.querySelector('#preparation-heading')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Start session' }));
    expect(openNewSession).toHaveBeenCalledTimes(1);
    // Without Tasks there is no Tasks summary: the Tasks page holds New task and its empty state.
    expect(container.querySelector('#tasks-summary-heading')).toBeNull();
    expect(headingOrder(container)).toEqual(['Documents']);
  });

  it.each([
    ['sessions_disabled', 'Sessions are turned off on this server.'],
    ['forbidden', "You don't have permission to start a session for this specification."],
  ])('explains the preparation path without a button when the start is %s', (reason, text) => {
    const { container } = renderEmpty(
      emptySpecification({ startSession: { available: false, reason } }),
    );

    expect(container.querySelector('#preparation-heading')).not.toBeNull();
    expect(screen.getByText(new RegExp(text.replace(/[.']/gu, '.'), 'u'))).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Start session' })).toBeNull();
  });

  it('shows the Sessions instead of the preparation block once a Session exists', () => {
    const working = createSpecificationWorkspaceFixture('working');
    const { container } = renderEmpty(
      emptySpecification({ resumeSession: working.resumeSession, sessions: working.sessions }),
    );

    expect(container.querySelector('#preparation-heading')).toBeNull();
    expect(container.querySelector('#resume-heading')).not.toBeNull();
  });
});
