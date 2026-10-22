// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LocalizationProvider, createSpecFlowI18n } from '../../i18n';
import {
  isoAgo,
  operationItem,
  operationList,
  runningItem,
  stubCreateKind,
} from '../../../test-support/operations/fixtures';
import { OperationsPanel, type OperationsPanelProps } from './OperationsPanel';
import { resetOperationsSession } from './operationsSession';

afterEach(() => {
  cleanup();
  resetOperationsSession();
});

function renderPanel(props: Partial<OperationsPanelProps> = {}, language: 'en' | 'pl' = 'en') {
  const onRetry = vi.fn();
  const tree = (next: Partial<OperationsPanelProps>) => (
    <LocalizationProvider instance={createSpecFlowI18n(language)}>
      <OperationsPanel
        list={operationList([])}
        failed={false}
        onRetry={onRetry}
        kinds={[stubCreateKind]}
        {...props}
        {...next}
      />
    </LocalizationProvider>
  );
  const view = render(tree({}));
  return { onRetry, update: (next: Partial<OperationsPanelProps>) => view.rerender(tree(next)) };
}

const panel = () => document.querySelector('[data-operations-panel]');

describe('OperationsPanel visibility', () => {
  it('renders nothing for an empty list', () => {
    renderPanel();
    expect(panel()).toBeNull();
    expect(screen.queryByRole('heading')).toBeNull();
  });

  it('renders nothing before the first read', () => {
    renderPanel({ list: undefined });
    expect(panel()).toBeNull();
  });

  it('names itself and summarises what is running and what needs a check', () => {
    renderPanel({
      list: operationList([
        runningItem(1),
        operationItem({ status: 'recovery-required', title: 'Billing' }),
      ]),
    });
    const section = screen.getByRole('region', { name: 'Background operations' });
    expect(section.textContent).toContain('1 running, 1 needs attention');
  });

  it('speaks Polish', () => {
    renderPanel({ list: operationList([runningItem(1)]) }, 'pl');
    expect(screen.getByRole('region', { name: 'Operacje w tle' }).textContent).toContain(
      '1 w toku',
    );
  });
});

describe('OperationsPanel rows', () => {
  it('shows the running step, branch and a link to the progress page', () => {
    const item = runningItem(1, { title: 'Payment limits' });
    renderPanel({ list: operationList([item]) });
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe(`/specs/new/creating/${item.operationId}`);
    // The accessible name is the visible text plus the status word for assistive technology.
    expect(link.textContent).toContain('Payment limits, ');
    expect(link.textContent).toContain('In progress. Step 2 of 4: Preparing the workspace');
    // One meta line: step and time; no kind, branch, trailing arrow or extra badge.
    expect(link.textContent).not.toContain('spec/payment-limits');
    expect(link.querySelector('svg:not([aria-hidden])')).toBeNull();
    expect(link.querySelector('[data-operation-meta]')?.textContent).toContain(
      'Step 2 of 4: Preparing the workspace · Started 2 minutes ago',
    );
    expect(link.querySelector('time')?.textContent).toBe('Started 2 minutes ago');
  });

  it('leaves out skipped steps when counting (an existing workspace)', () => {
    const item = operationItem({
      currentStep: 'writing-specification',
      steps: [
        { id: 'reserving', status: 'done' },
        { id: 'preparing-workspace', status: 'skipped' },
        { id: 'writing-specification', status: 'running' },
        { id: 'registering', status: 'pending' },
      ],
    });
    renderPanel({ list: operationList([item]) });
    expect(screen.getByRole('link').textContent).toContain('Step 2 of 3');
  });

  it('asks to check the result of a row that needs it, and cannot hide it', () => {
    renderPanel({ list: operationList([operationItem({ status: 'recovery-required' })]) });
    expect(screen.getByRole('link').textContent).toContain('Check result');
    expect(screen.queryByRole('button', { name: 'Hide Payment limits' })).toBeNull();
  });

  it('says how long a stalled operation had no activity', () => {
    renderPanel({
      list: operationList([
        operationItem({
          status: 'recovery-required',
          code: 'OPERATION_INTERRUPTED',
          updatedAt: isoAgo(7),
        }),
      ]),
    });
    expect(screen.getByRole('link').textContent).toContain(
      'No activity for 7 min. Check the result',
    );
  });

  it('draws an unknown kind and status as a generic row without a link', () => {
    renderPanel({
      list: operationList([
        operationItem({ kind: 'future-kind', status: 'paused', title: undefined }),
      ]),
    });
    expect(screen.queryByRole('link')).toBeNull();
    const row = document.querySelector('[data-operation-kind="future-kind"]');
    expect(row?.textContent).toContain('Operation');
    expect(row?.textContent).toContain('Status unknown');
  });

  it('hides a finished row for the session', () => {
    const done = operationItem({ status: 'completed', title: 'Billing' });
    const failed = operationItem({ status: 'failed', title: 'Orders' });
    const { update } = renderPanel({ list: operationList([done, failed, runningItem(1)]) });
    fireEvent.click(screen.getByRole('button', { name: 'Hide Billing' }));
    expect(screen.queryByText('Billing')).toBeNull();
    expect(screen.getByText('Orders')).toBeTruthy();
    // A later read that still carries the row does not bring it back.
    update({ list: operationList([done, failed, runningItem(2)]) });
    expect(screen.queryByText('Billing')).toBeNull();
    expect(screen.getByRole('button', { name: 'Hide Orders' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Hide Payment/ })).toBeNull();
  });

  it('removes the panel once every finished row is hidden', () => {
    renderPanel({
      list: operationList([operationItem({ status: 'completed', title: 'Billing' })]),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Hide Billing' }));
    expect(panel()).toBeNull();
  });
});

describe('OperationsPanel overflow', () => {
  const many = (count: number) =>
    operationList(
      Array.from({ length: count }, (_, index) => runningItem(1, { title: `Spec ${index + 1}` })),
    );

  it('shows five rows and expands to all on request', () => {
    renderPanel({ list: many(8) });
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
    fireEvent.click(screen.getByRole('button', { name: 'Show all (8)' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(8);
    fireEvent.click(screen.getByRole('button', { name: 'Show fewer' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
  });

  it('offers no overflow control for five rows or fewer', () => {
    renderPanel({ list: many(5) });
    expect(screen.queryByRole('button', { name: /Show all/ })).toBeNull();
  });

  it('says it shows a part of a truncated list', () => {
    const list = { ...many(6), truncated: true, counts: { ...many(6).counts, inProgress: 9 } };
    renderPanel({ list });
    fireEvent.click(screen.getByRole('button', { name: 'Show all (6)' }));
    expect(screen.getByText('Showing 6 of 9')).toBeTruthy();
  });

  it('is always open: no collapse control and the rows stay visible', () => {
    renderPanel({ list: many(2) });
    expect(screen.queryByRole('button', { name: /Hide operations|Show operations/ })).toBeNull();
    expect(document.querySelector('[aria-expanded]')).toBeNull();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });
});

describe('OperationsPanel errors', () => {
  it('says the list cannot be loaded and retries on request', () => {
    const { onRetry } = renderPanel({ list: undefined, failed: true });
    expect(screen.getByText("Background operations can't be loaded")).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('keeps the rows and says it is retrying when a refresh fails', () => {
    renderPanel({ list: operationList([runningItem(1)]), failed: true });
    expect(screen.getByRole('link')).toBeTruthy();
    expect(screen.getByText('Cannot refresh. Retrying')).toBeTruthy();
  });
});

describe('OperationsPanel announcements', () => {
  const live = () =>
    screen.getAllByRole('status').find((node) => node.classList.contains('sr-only'));

  it('is a list that is not a live region, with one polite status beside it', () => {
    renderPanel({ list: operationList([runningItem(1)]) });
    const region = screen.getByRole('region');
    expect(within(region).getByRole('list').closest('[aria-live]')).toBeNull();
    expect(live()?.getAttribute('aria-live')).toBe('polite');
    expect(live()?.textContent).toBe('');
  });

  it('announces a status transition and nothing for a step change', () => {
    const running = runningItem(1, { title: 'Billing' });
    const { update } = renderPanel({ list: operationList([running]) });
    update({
      list: operationList([runningItem(2, { ...running, operationId: running.operationId })]),
    });
    expect(live()?.textContent).toBe('');
    update({ list: operationList([{ ...running, status: 'completed' }]) });
    expect(live()?.textContent).toBe('Billing is done');
    update({ list: operationList([{ ...running, status: 'recovery-required' }]) });
    expect(live()?.textContent).toBe('Billing needs a check');
  });

  it('does not announce what was already there on the first read', () => {
    renderPanel({ list: operationList([operationItem({ status: 'completed' })]) });
    expect(live()?.textContent).toBe('');
  });
});

describe('OperationsPanel structure', () => {
  it('is one container with plain rows: no nested bordered surface, no trailing chevron', () => {
    renderPanel({ list: operationList([runningItem(1), operationItem({ status: 'completed' })]) });
    const section = document.querySelector('[data-operations-panel]')!;
    for (const item of section.querySelectorAll('li, li a')) {
      expect(item.className).not.toMatch(/(^| )border( |$)|rounded-composite|bg-surface-subtle/);
    }
    expect(section.querySelector('[class*="chevron"]')).toBeNull();
  });

  it('keeps a finished row visible with its name and a hide control', () => {
    renderPanel({
      list: operationList([operationItem({ status: 'completed', title: 'Billing' })]),
    });
    expect(screen.getByText('Billing')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Hide Billing' })).toBeTruthy();
  });
});
