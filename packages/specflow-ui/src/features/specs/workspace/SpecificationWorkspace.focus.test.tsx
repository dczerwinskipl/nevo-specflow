// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import { AppShell } from '@nevo/ui';
import { createSpecFlowQueryClient } from '../../../app/queryClient';
import { UiModulesProvider } from '../../../app/ui-modules/UiModulesProvider';
import { builtInUiModuleRegistry } from '../../../app/ui-modules/builtInUiModules';
import { LocalizationProvider, createSpecFlowI18n } from '../../../i18n';
import { createSpecFlowAppServices } from '../../../services';
import { TestServicesRouterContext } from '../../../../test-support/app/TestServicesRouterContext';
import { createSpecificationWorkspaceFixture } from '../../../../test-support/specs/workspace/fixtures';
import { SpecificationWorkspace } from './SpecificationWorkspace';

/** The Overview's content width, as its sentinel reports it; every other element is 1600 wide. */
let overviewWidth = 1600;
const observers: { callback: ResizeObserverCallback; elements: Element[] }[] = [];

beforeEach(() => {
  observers.length = 0;
  overviewWidth = 1600;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      private readonly entry: { callback: ResizeObserverCallback; elements: Element[] };
      constructor(callback: ResizeObserverCallback) {
        this.entry = { callback, elements: [] };
        observers.push(this.entry);
      }
      observe = (element: Element) => void this.entry.elements.push(element);
      unobserve = () => undefined;
      disconnect = () => undefined;
    },
  );
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const width = this.hasAttribute('data-overview-sentinel') ? overviewWidth : 1600;

    return { width, height: 900, x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0 } as DOMRect;
  });
  // Elements count as rendered (focus restoration skips hidden ones); frames run on a macrotask.
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(
    () => [{}] as unknown as DOMRectList,
  );
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** The Overview's width changes (the Secondary opened or closed beside it). */
function resizeOverview(width: number) {
  overviewWidth = width;
  act(() => {
    for (const { callback, elements } of observers) {
      if (elements.some((element) => element.hasAttribute('data-overview-sentinel'))) {
        callback([], {} as ResizeObserver);
      }
    }
  });
}

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });

function Workspace() {
  const data = { ...createSpecificationWorkspaceFixture('working', 'SPEC-1'), activityEvents: [] };

  return (
    <QueryClientProvider client={createSpecFlowQueryClient()}>
      <TestServicesRouterContext services={createSpecFlowAppServices({})}>
        <UiModulesProvider modules={builtInUiModuleRegistry}>
          <LocalizationProvider instance={createSpecFlowI18n('en')}>
            <AppShell navigation={<div>Navigation</div>}>
              <SpecificationWorkspace specId="SPEC-1" data={data} />
            </AppShell>
          </LocalizationProvider>
        </UiModulesProvider>
      </TestServicesRouterContext>
    </QueryClientProvider>
  );
}

function columns(container: HTMLElement) {
  return container.querySelector<HTMLElement>('[data-overview-columns]')?.dataset.overviewColumns;
}

function documentRow(container: HTMLElement) {
  const context = container.querySelector<HTMLElement>('[data-overview-column="context"]');
  expect(context).not.toBeNull();

  return within(context!).getByRole('button', { name: 'Specyfikacja' });
}

describe('Specification Overview focus across the column change', () => {
  it('returns focus to the document row that opened the preview after both crossings', async () => {
    const { container } = render(<Workspace />);
    expect(columns(container)).toBe('2');
    const opener = documentRow(container);
    opener.focus();
    fireEvent.click(opener);
    await settle();

    // The preview narrows the Overview to one column: Documents remount.
    resizeOverview(1000);
    expect(columns(container)).toBe('1');
    expect(opener.isConnected).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: /Close secondary content/i }));
    // Closed: two columns again, Documents remount once more before focus is restored.
    resizeOverview(1600);
    await settle();

    expect(columns(container)).toBe('2');
    expect(document.activeElement).toBe(documentRow(container));
  });

  it('keeps focus on a side-column row whose section remounts while it is focused', () => {
    const { container } = render(<Workspace />);
    documentRow(container).focus();

    resizeOverview(1000);

    expect(columns(container)).toBe('1');
    const row = screen.getByRole('button', { name: 'Specyfikacja' });
    expect(row.closest('[data-focus-key]')?.getAttribute('data-focus-key')).toBe('document:spec');
    expect(document.activeElement).toBe(row);
  });
});
