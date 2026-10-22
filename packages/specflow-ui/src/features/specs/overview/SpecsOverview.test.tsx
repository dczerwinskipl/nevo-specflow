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
    expect(within(empty).queryByRole('button')).toBeNull();
  });
});

describe('SpecsOverview create', () => {
  const createButtons = () => screen.getAllByRole('button', { name: 'New specification' });

  it('keeps Create visible but disabled until it can be used (header and empty state)', () => {
    renderOverview(
      { ...loaded(), projection: { ...createSpecsFixture(), items: [] } },
      { createDisabled: true },
    );
    const buttons = createButtons();
    expect(buttons.length).toBeGreaterThan(1);
    expect(buttons.every((button) => button.hasAttribute('disabled'))).toBe(true);
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

  it('is always offered in the archive', () => {
    renderOverview(loaded('archive'));
    expect(screen.getByRole('textbox', { name: 'Search specifications' })).toBeTruthy();
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

  describe('an unfinished Create', () => {
    const creating = { title: 'Payment limits', href: '/specs/new/creating/op-1' };

    it('shows a way back to its progress page above the current list', () => {
      renderOverview(loaded(), { creating });
      const link = screen.getByRole('link', {
        name: 'Show the progress of creating Payment limits',
      });
      expect(link.getAttribute('href')).toBe('/specs/new/creating/op-1');
      expect(link.textContent).toContain('Creating Payment limits…');
      expect(link.textContent).toContain('(in progress)');
    });

    it('names no specification it does not know', () => {
      renderOverview(loaded(), { creating: { href: creating.href } });
      expect(screen.getByRole('link', { name: 'Show progress' }).textContent).toContain(
        'Creating a specification…',
      );
    });

    it('is absent when nothing is unfinished and in the archive', () => {
      renderOverview(loaded());
      expect(screen.queryByText(/in progress/)).toBeNull();
      cleanup();
      renderOverview(loaded('archive'), { creating });
      expect(screen.queryByText(/in progress/)).toBeNull();
    });
  });
});
