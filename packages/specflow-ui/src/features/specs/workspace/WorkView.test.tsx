// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UiModulesProvider } from '../../../app/ui-modules/UiModulesProvider';
import { builtInUiModuleRegistry } from '../../../app/ui-modules/builtInUiModules';
import { LocalizationProvider, createSpecFlowI18n } from '../../../i18n';
import { createSpecificationWorkspaceFixture } from '../../../../test-support/specs/workspace/fixtures';
import type { SpecificationWorkspaceData } from '../read-model/model';
import { createFakeWorkspaceRuntime, WorkspaceProvider } from './WorkspaceContext';
import { OVERVIEW_TWO_COLUMN_MIN_WIDTH, WorkView } from './WorkView';

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
    <UiModulesProvider modules={builtInUiModuleRegistry}>
      <LocalizationProvider instance={createSpecFlowI18n('en')}>
        <WorkspaceProvider runtime={createFakeWorkspaceRuntime()}>
          <WorkView data={data} />
        </WorkspaceProvider>
      </LocalizationProvider>
    </UiModulesProvider>,
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
    .filter((text) => /Requires your attention|Continue session|Tasks|Documents/.test(text))
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
    expect(headingOrder(container)).toEqual([
      'Requires your attention',
      'Continue session',
      'Tasks',
      'Documents',
    ]);

    resizeTo(1600);
    expect(headingOrder(container)).toEqual([
      'Requires your attention',
      'Tasks',
      'Continue session',
      'Documents',
    ]);
    const context = container.querySelector('[data-overview-column="context"]');
    expect(context?.querySelector('#resume-heading')).not.toBeNull();
    expect(context?.querySelector('#documents-summary-heading')).not.toBeNull();
    expect(context?.querySelector('#tasks-heading')).toBeNull();
  });

  it('lets Tasks open the work column when nothing requires attention', () => {
    const { container } = renderWorkView(
      1600,
      withoutAttention(createSpecificationWorkspaceFixture('working')),
    );

    expect(headingOrder(container)[0]).toBe('Tasks');
    // The empty attention slot is the `peer` that hands the column start to the next section.
    const tasks = container.querySelector('#tasks-heading')?.closest('[class*="col-start-1"]');
    expect(tasks?.previousElementSibling?.classList.contains('peer')).toBe(true);
    expect(tasks?.previousElementSibling?.childElementCount).toBe(0);
  });

  it('shows Documents first in the context column without a Session', () => {
    const data = createSpecificationWorkspaceFixture('no-git');
    const { container } = renderWorkView(1600, { ...data, resumeSession: undefined });
    const context = container.querySelector('[data-overview-column="context"]');

    expect(context?.firstElementChild?.querySelector('#documents-summary-heading')).not.toBeNull();
    expect(container.querySelector('#resume-heading')).toBeNull();
  });

  it('keeps the Task selection when the Overview crosses the breakpoint', () => {
    const { container } = renderWorkView(1600);
    const checkbox = screen.getAllByRole('checkbox')[0]!;
    fireEvent.click(checkbox);
    expect(checkbox.getAttribute('aria-checked')).toBe('true');

    resizeTo(1000);
    expect(columns(container)).toBe('1');
    // The same element, moved rather than remounted, still checked.
    expect(screen.getAllByRole('checkbox')[0]).toBe(checkbox);
    expect(checkbox.getAttribute('aria-checked')).toBe('true');
  });
});
