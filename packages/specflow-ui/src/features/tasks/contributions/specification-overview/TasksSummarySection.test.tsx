// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TaskOverview } from '@nevo/specflow-contracts/specs/workspace';
import { LocalizationProvider, createSpecFlowI18n } from '../../../../i18n';
import { mapWorkspaceResponse } from '../../../specs/read-model/mapWorkspaceResponse';
import { createFakeWorkspaceRuntime } from '../../../specs/workspace/WorkspaceContext';
import { controlCenterWorkspace } from '../../overview/controlCenter.stories-support';
import { TasksSummarySection } from './TasksSummarySection';
import { tasksPreviewFixtures } from './tasksPreview.stories-support';

afterEach(cleanup);

async function renderSummary(overview?: TaskOverview) {
  const mapped = mapWorkspaceResponse(await controlCenterWorkspace('waiting'));
  const data = overview ? { ...mapped, taskOverview: overview } : mapped;
  const actions = createFakeWorkspaceRuntime({ openTasks: vi.fn(), openTask: vi.fn() });
  const view = render(
    <LocalizationProvider instance={createSpecFlowI18n('en')}>
      <TasksSummarySection specId="sso" data={data} actions={actions} />
    </LocalizationProvider>,
  );

  return { ...view, actions };
}

const rows = (container: HTMLElement) =>
  [...container.querySelectorAll<HTMLElement>('[data-row-task]')].map((row) => row.dataset.rowTask);

describe('Overview Tasks summary', () => {
  it('shows every row group as Task rows, without a column header or group headers', async () => {
    const { container } = await renderSummary(tasksPreviewFixtures.three);

    expect(rows(container)).toEqual(['oidc-callback', 'session-refresh', 'sign-in-screen']);
    expect(container.querySelector('[data-collection-columns]')).toBeNull();
    // A held Task that nothing waits on is not attention: its reason is the supporting line.
    expect(container.querySelector('[data-task-attention]')).toBeNull();
    expect(
      container.querySelector('[data-row-task="sign-in-screen"] [data-task-status-cell]')
        ?.textContent,
    ).toBe('On holdWaiting for the identity provider sandbox account from IT.');
    expect(container.querySelector('[data-summary-more]')).toBeNull();
  });

  it('bounds the rows by group, the held Task that holds up others first with its overlay', async () => {
    const { container } = await renderSummary(tasksPreviewFixtures.twentyFive);

    expect(rows(container)).toHaveLength(8);
    const held = container.querySelector<HTMLElement>('[data-row-task="T-07"]')!;
    expect(held.dataset.taskAttention).toBe('true');
    expect(held.textContent).toContain('Requires attention · holds up T-12, T-13');
    expect(
      [...container.querySelectorAll('[data-summary-more]')].map((link) => link.textContent),
    ).toEqual(['2 more in In progress', '1 more in Ready to start', '3 more in Waiting']);
    expect(screen.getByRole('link', { name: 'Done 10' })).not.toBeNull();
    expect(screen.getByRole('link', { name: 'Cancelled 1' })).not.toBeNull();
  });

  it('opens the Tasks page filtered to a group, the Full Task from a row', async () => {
    const { actions } = await renderSummary(tasksPreviewFixtures.seven);
    const more = screen.getByRole('link', { name: '2 more in Waiting' });

    expect(more.getAttribute('href')).toBe('/specs/fake/tasks');
    fireEvent.click(more);
    fireEvent.click(screen.getByRole('link', { name: 'Evaluate identity provider SDKs' }));
    fireEvent.click(screen.getByRole('button', { name: 'All tasks' }));

    expect(actions.openTasks).toHaveBeenNthCalledWith(1, { group: 'waiting' });
    expect(actions.openTask).toHaveBeenCalledWith('T-01');
    expect(actions.openTasks).toHaveBeenNthCalledWith(2);
  });

  it('renders the Runtime preview of a workspace read, compact groups as links', async () => {
    const { container, actions } = await renderSummary();

    // Needs approval, In progress, Cannot start, Waiting, On hold: one row each.
    expect(rows(container)).toEqual(['T-04', 'T-02', 'T-07', 'T-03', 'T-05']);
    expect(container.querySelector('[data-row-task="T-07"]')?.textContent).toContain(
      'Requires attention · Cannot start: its context entry',
    );
    fireEvent.click(screen.getByRole('link', { name: 'Cancelled 1' }));
    expect(actions.openTasks).toHaveBeenCalledWith({ group: 'cancelled' });
  });

  it('keeps its place without Tasks', async () => {
    await renderSummary({ rows: [], compact: [] });

    expect(screen.getByText('No tasks yet')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'All tasks' })).not.toBeNull();
  });
});
