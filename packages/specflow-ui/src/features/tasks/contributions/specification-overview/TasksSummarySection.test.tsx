// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalizationProvider, createSpecFlowI18n } from '../../../../i18n';
import { mapWorkspaceResponse } from '../../../specs/read-model/mapWorkspaceResponse';
import { createFakeWorkspaceRuntime } from '../../../specs/workspace/WorkspaceContext';
import { controlCenterWorkspace } from '../../overview/controlCenter.stories-support';
import { TasksSummarySection } from './TasksSummarySection';

afterEach(cleanup);

async function renderSummary(scenario: 'waiting' | 'stuck') {
  const data = mapWorkspaceResponse(await controlCenterWorkspace(scenario));
  const actions = createFakeWorkspaceRuntime({ openTasks: vi.fn() });
  const view = render(
    <LocalizationProvider instance={createSpecFlowI18n('en')}>
      <TasksSummarySection specId="sso" data={data} actions={actions} />
    </LocalizationProvider>,
  );

  return { ...view, data, actions };
}

const rowText = (container: HTMLElement, group: string) =>
  container.querySelector(`[data-summary-group="${group}"]`)?.textContent;

describe('Overview Tasks summary', () => {
  it('names a Task in full once: one in Requires attention appears by id only', async () => {
    const { container, data } = await renderSummary('waiting');
    const named =
      data.featureAttention?.tasks.state === 'available'
        ? data.featureAttention.tasks.items.map((item) => item.targetId)
        : [];

    expect(named).toEqual(['T-02', 'T-07']);
    expect(rowText(container, 'in-progress')).toContain('1 task · T-02');
    expect(rowText(container, 'in-progress')).not.toContain('Token exchange');
    expect(rowText(container, 'cannot-start')).not.toContain('Rate-limit');
    expect(rowText(container, 'needs-approval')).toContain('T-04 Return users to where they were');
    // The Tasks a Specification item covers (tasks-stuck) are named by id only too.
    cleanup();
    const stuck = await renderSummary('stuck');
    expect(rowText(stuck.container, 'needs-approval')).toContain('1 task · T-04');
    expect(rowText(stuck.container, 'needs-approval')).not.toContain('Return users');
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('opens the Tasks page at a group, compact groups included', async () => {
    const { actions } = await renderSummary('waiting');
    fireEvent.click(screen.getByRole('link', { name: 'Cancelled 1' }));
    fireEvent.click(screen.getByRole('link', { name: 'Waiting: open on the Tasks page' }));
    fireEvent.click(screen.getByRole('button', { name: 'All tasks' }));

    expect(actions.openTasks).toHaveBeenNthCalledWith(1, { group: 'cancelled' });
    expect(actions.openTasks).toHaveBeenNthCalledWith(2, { group: 'waiting' });
    expect(actions.openTasks).toHaveBeenNthCalledWith(3);
  });
});
