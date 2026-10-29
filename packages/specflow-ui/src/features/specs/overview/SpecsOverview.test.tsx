// @vitest-environment jsdom
import { QueryClientProvider } from '@tanstack/react-query';
import { AppShell, AppWorkspaceProvider } from '@nevo/ui';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSpecFlowQueryClient } from '../../../app/queryClient';
import { LocalizationProvider, createSpecFlowI18n } from '../../../i18n';
import { createSpecFlowAppServices } from '../../../services';
import { stubLayoutApis } from '../../../../test-support/app/stubLayoutApis';
import { TestServicesRouterContext } from '../../../../test-support/app/TestServicesRouterContext';
import {
  createArchiveItem,
  createSpecItem,
  createSpecsFixture,
} from '../../../../test-support/specs/overview/fixtures';
import type { SpecsCollection, SpecsOverviewState } from './model';
import { SpecsOverview, type SpecsOverviewProps } from './SpecsOverview';

beforeEach(stubLayoutApis);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const loaded = (collection: SpecsCollection = 'current'): SpecsOverviewState => ({
  collection,
  projection: createSpecsFixture(collection),
  loading: false,
  refreshing: false,
  error: false,
});

function renderOverview(state: SpecsOverviewState, props: Partial<SpecsOverviewProps> = {}) {
  const handlers = {
    onCollectionChange: vi.fn(),
    onRefresh: vi.fn(),
    onCreate: vi.fn(),
    ...props,
  };
  const services = createSpecFlowAppServices({});
  const tree = (next: SpecsOverviewState) => (
    <QueryClientProvider client={createSpecFlowQueryClient()}>
      <TestServicesRouterContext services={services}>
        <LocalizationProvider instance={createSpecFlowI18n('en')}>
          <AppWorkspaceProvider>
            <AppShell navigation={<div>Nav</div>}>
              <SpecsOverview state={next} {...handlers} />
            </AppShell>
          </AppWorkspaceProvider>
        </LocalizationProvider>
      </TestServicesRouterContext>
    </QueryClientProvider>
  );
  const view = render(tree(state));
  return { ...handlers, rerender: (next: SpecsOverviewState) => view.rerender(tree(next)) };
}

const manyCurrent = (count: number): SpecsOverviewState => {
  const base = createSpecsFixture();
  return {
    ...loaded(),
    projection: {
      ...base,
      items: Array.from({ length: count }, (_, index) =>
        createSpecItem({ id: `spec-${index}`, title: `Specification number ${index}` }),
      ),
    },
  };
};

describe('SpecsOverview states', () => {
  it('shows a labelled loading placeholder and no rows while the first read is pending', () => {
    renderOverview({ collection: 'current', loading: true, refreshing: false, error: false });
    expect(screen.getByRole('status', { name: 'Loading specifications' })).toBeTruthy();
    expect(document.querySelector('[data-spec-id]')).toBeNull();
  });

  it('says the list is unavailable and retries on request when nothing could be read', () => {
    const { onRefresh } = renderOverview({
      collection: 'current',
      loading: false,
      refreshing: false,
      error: true,
    });
    const alert = screen.getByRole('alert');
    expect(within(alert).getByText('Specifications are unavailable')).toBeTruthy();
    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('No current specifications')).toBeNull();
  });

  it('keeps the rows and warns when a refresh failed', () => {
    renderOverview({ ...loaded(), error: true });
    expect(within(screen.getByRole('alert')).getByText(/refresh/i)).toBeTruthy();
    expect(document.querySelector('[data-spec-id]')).not.toBeNull();
  });

  it('disables Retry while a read is already running', () => {
    renderOverview({ collection: 'current', loading: false, refreshing: true, error: true });
    expect(
      within(screen.getByRole('alert'))
        .getByRole('button', { name: 'Retry' })
        .hasAttribute('disabled'),
    ).toBe(true);
  });

  it('offers to create the first specification in an empty current list', () => {
    const { onCreate } = renderOverview({
      ...loaded(),
      projection: { ...createSpecsFixture(), items: [] },
    });
    expect(screen.getByText('No current specifications')).toBeTruthy();
    const empty = screen.getByText('No current specifications').parentElement!;
    // The shared empty screen of a whole area, alone: no column headers that describe no row.
    expect(empty.getAttribute('data-empty-state')).toBe('pane');
    expect(document.querySelector('[data-spec-columns]')).toBeNull();
    expect(within(empty).getAllByRole('button')).toHaveLength(1);
    fireEvent.click(within(empty).getByRole('button', { name: 'New specification' }));
    expect(onCreate).toHaveBeenCalled();
  });

  it('does not offer creation in an empty archive', () => {
    renderOverview({
      ...loaded('archive'),
      projection: { ...createSpecsFixture('archive'), items: [] },
    });
    expect(screen.getByText('No archived specifications')).toBeTruthy();
    const empty = screen.getByText('No archived specifications').parentElement!;
    expect(empty.getAttribute('data-empty-state')).toBe('pane');
    expect(document.querySelector('[data-spec-columns]')).toBeNull();
    expect(within(empty).queryByRole('button')).toBeNull();
  });
});

describe('SpecsOverview create', () => {
  const createButtons = () => screen.getAllByRole('button', { name: 'New specification' });

  it('keeps Create visible but disabled until it can be used', () => {
    renderOverview(loaded(), { createDisabled: true });
    const buttons = createButtons();
    expect(buttons).toHaveLength(1);
    expect(buttons.every((button) => button.hasAttribute('disabled'))).toBe(true);
    cleanup();
    renderOverview(
      { ...loaded(), projection: { ...createSpecsFixture(), items: [] } },
      { createDisabled: true },
    );
    expect(createButtons().every((button) => button.hasAttribute('disabled'))).toBe(true);
  });

  it('has one primary Create: the empty state owns it, the header has it otherwise', () => {
    // Empty current list: only the empty state's action, the header does not repeat it.
    renderOverview({ ...loaded(), projection: { ...createSpecsFixture(), items: [] } });
    const empty = screen.getByText('No current specifications').parentElement!;
    expect(createButtons()).toHaveLength(1);
    expect(empty.contains(createButtons()[0]!)).toBe(true);
    cleanup();
    // A list with rows: the header action.
    renderOverview(loaded());
    expect(createButtons()).toHaveLength(1);
    cleanup();
    // An empty archive offers no creation in its empty state: the header keeps it.
    renderOverview({
      ...loaded('archive'),
      projection: { ...createSpecsFixture('archive'), items: [] },
    });
    expect(createButtons()).toHaveLength(1);
    expect(
      screen.getByText('No archived specifications').parentElement!.contains(createButtons()[0]!),
    ).toBe(false);
  });

  it('has no Create control at all when the host does not offer one', () => {
    renderOverview(loaded(), { onCreate: undefined });
    expect(screen.queryByRole('button', { name: 'New specification' })).toBeNull();
  });
});

describe('SpecsOverview search', () => {
  const searchBox = () =>
    screen.getByRole<HTMLInputElement>('textbox', { name: 'Search specifications' });

  it('is offered from twelve rows, never before in the current list', () => {
    const view = renderOverview(manyCurrent(11));
    expect(screen.queryByRole('textbox', { name: 'Search specifications' })).toBeNull();
    view.rerender(manyCurrent(12));
    expect(screen.getByRole('textbox', { name: 'Search specifications' })).toBeTruthy();
  });

  it('is always offered in an archive with specifications, never in an empty one', () => {
    const view = renderOverview(loaded('archive'));
    expect(screen.getByRole('textbox', { name: 'Search specifications' })).toBeTruthy();
    view.rerender({
      ...loaded('archive'),
      projection: { ...createSpecsFixture('archive'), items: [] },
    });
    expect(screen.queryByRole('textbox', { name: 'Search specifications' })).toBeNull();
  });

  it('filters rows, explains an empty result and clears it', () => {
    renderOverview({
      ...loaded('archive'),
      projection: {
        ...createSpecsFixture('archive'),
        items: [
          createArchiveItem({ id: 'a', title: 'Payment limits' }),
          createArchiveItem({ id: 'b', title: 'Audit trail', key: 'UI-2' }),
        ],
      },
    });
    const box = screen.getByRole('textbox', { name: 'Search specifications' });
    fireEvent.change(box, { target: { value: 'audit' } });
    expect(document.querySelectorAll('[data-spec-id]')).toHaveLength(1);
    fireEvent.change(box, { target: { value: 'nothing like it' } });
    expect(screen.getByText('No matching specifications')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(document.querySelectorAll('[data-spec-id]')).toHaveLength(2);
    expect((box as HTMLInputElement).value).toBe('');
  });

  it('keeps the search box while a term is typed even if few rows remain', () => {
    renderOverview(manyCurrent(12));
    const box = screen.getByRole('textbox', { name: 'Search specifications' });
    fireEvent.change(box, { target: { value: 'number 3' } });
    expect(screen.getByRole('textbox', { name: 'Search specifications' })).toBe(box);
  });

  it('does not carry a term into another collection', () => {
    const view = renderOverview(loaded('archive'));
    fireEvent.change(screen.getByRole('textbox', { name: 'Search specifications' }), {
      target: { value: 'zzz' },
    });
    view.rerender(manyCurrent(12));
    expect(searchBox().value).toBe('');
    // The term stays with the collection it was typed in.
    view.rerender(loaded('archive'));
    expect(searchBox().value).toBe('zzz');
  });
});

describe('SpecsOverview collections', () => {
  it('reports the collection the user picks', () => {
    const { onCollectionChange } = renderOverview(loaded());
    fireEvent.click(screen.getByRole('radio', { name: 'Archive' }));
    expect(onCollectionChange).toHaveBeenCalledWith('archive');
  });

  describe('the operations panel slot', () => {
    const panel = <section aria-label="Background operations">Panel</section>;

    it('renders the slot above the list', () => {
      renderOverview(loaded(), { operationsPanel: panel });
      const region = screen.getByRole('region', { name: 'Background operations' });
      const list = document.querySelector('[data-spec-id]');
      expect(
        region.compareDocumentPosition(list as Node) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it('draws nothing of its own when the host gives no panel', () => {
      renderOverview(loaded());
      expect(screen.queryByRole('region', { name: 'Background operations' })).toBeNull();
      expect(document.querySelector('[data-creating-specification]')).toBeNull();
    });
  });
});

describe('SpecsOverview without work status', () => {
  const unknownItem = (id: string, extra: Parameters<typeof createSpecItem>[0] = {}) =>
    createSpecItem({
      id,
      title: `Spec ${id}`,
      classification: { section: 'unknown' },
      progress: null,
      signals: null,
      currentExecutions: null,
      ...extra,
    });
  const unavailable = (items = [unknownItem('a'), unknownItem('b')]): SpecsOverviewState => ({
    ...loaded(),
    projection: { ...createSpecsFixture(), sections: ['unknown'], items },
  });

  it('shows a flat list: no group, no empty columns, the updated time in its own column', () => {
    renderOverview(unavailable());
    expect(document.querySelector('[data-spec-layout="flat"]')).not.toBeNull();
    expect(document.querySelectorAll('[data-spec-id]')).toHaveLength(2);
    expect(screen.queryByText('Status unavailable')).toBeNull();
    expect(screen.queryByText('Work status not available yet')).toBeNull();
    expect(screen.queryByText('Progress unavailable')).toBeNull();
    // Columns of what exists: the specification and when it was updated, no situation or progress.
    expect(document.querySelector('[data-spec-columns]')?.textContent).toBe('SpecificationUpdated');
    expect(document.querySelector('[data-spec-section-header]')).toBeNull();
    expect(document.querySelectorAll('[data-spec-updated] time')).toHaveLength(2);
    expect(screen.getAllByText(/Updated .*2026/)).toHaveLength(2);
    // The date is not repeated among the facts under the title.
    expect(document.querySelector('[data-spec-metadata]')).toBeNull();
  });

  it('shows what a project Runtime really provides: the title and the update date', () => {
    renderOverview(
      unavailable([
        createSpecItem({
          id: 'real',
          title: 'Logowanie SSO',
          key: undefined,
          tags: [],
          pullRequests: [],
          updatedAt: '2026-10-28T18:54:17.623Z',
          progress: null,
          classification: { section: 'unknown' },
          signals: null,
          currentExecutions: null,
        }),
      ]),
    );
    const row = document.querySelector<HTMLElement>('[data-spec-id="real"]')!;
    expect(within(row).getByRole('heading', { name: 'Logowanie SSO' })).toBeTruthy();
    expect(row.querySelector('[data-spec-metadata]')).toBeNull();
    expect(row.querySelector('time')?.getAttribute('dateTime')).toBe('2026-10-28T18:54:17.623Z');
    expect(row.querySelector('[data-spec-progress]')).toBeNull();
  });

  it('keeps the progress column when only progress exists', () => {
    renderOverview(
      unavailable([unknownItem('a', { progress: { completed: 1, total: 2 } }), unknownItem('b')]),
    );
    expect(document.querySelector('[data-spec-layout="flat"]')).not.toBeNull();
    expect(document.querySelector('[data-spec-columns]')?.textContent).toBe(
      'SpecificationUpdatedProgress',
    );
  });

  it('keeps the layout while searching (decided from the whole collection)', () => {
    renderOverview(unavailable(Array.from({ length: 12 }, (_, i) => unknownItem(`s${i}`))));
    fireEvent.change(screen.getByRole('textbox', { name: 'Search specifications' }), {
      target: { value: 'Spec s3' },
    });
    expect(document.querySelector('[data-spec-layout="flat"]')).not.toBeNull();
    expect(document.querySelectorAll('[data-spec-id]')).toHaveLength(1);
  });

  it('groups by status when real status data exists, and rows have no actions menu', () => {
    renderOverview(loaded());
    expect(document.querySelector('[data-spec-layout="grouped"]')).not.toBeNull();
    expect(document.querySelector('[data-spec-section-header]')).not.toBeNull();
    expect(screen.queryByRole('button', { name: /Specification actions: / })).toBeNull();
  });
});
