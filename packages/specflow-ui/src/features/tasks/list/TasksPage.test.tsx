// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalizationProvider, createSpecFlowI18n } from '../../../i18n';
import { controlCenterTaskList } from '../overview/controlCenter.stories-support';
import { validateTasksSearch } from '../routes';
import { TasksPage, type TasksPageProps } from './TasksPage';
import { taskListViewOf } from './taskListModel';

afterEach(cleanup);
// jsdom has no layout: arriving at a group scrolls its heading into view.
Element.prototype.scrollIntoView = () => undefined;

function renderPage(props: Partial<TasksPageProps> = {}) {
  const onClearBlocking = vi.fn();
  const view = render(
    <LocalizationProvider instance={createSpecFlowI18n('en')}>
      <TasksPage
        state={{ status: 'ready', view: taskListViewOf(controlCenterTaskList('waiting')) }}
        blocking={false}
        fullTaskHref={(taskId) => `/specs/sso/tasks/${taskId}`}
        onOpenTask={vi.fn()}
        onClearBlocking={onClearBlocking}
        {...props}
      />
    </LocalizationProvider>,
  );

  return { ...view, onClearBlocking };
}

const row = (container: HTMLElement, taskId: string) =>
  container.querySelector<HTMLElement>(`[data-row-task="${taskId}"]`);

describe('Tasks page', () => {
  it('renders the configured grouping as delivered, with the reason on flagged rows only', () => {
    const { container } = renderPage();

    expect(
      [...container.querySelectorAll('[data-task-group]')].map((group) =>
        group.getAttribute('data-task-group'),
      ),
    ).toEqual([
      'needs-approval',
      'in-progress',
      'cannot-start',
      'waiting',
      'on-hold',
      'done',
      'cancelled',
    ]);
    expect(row(container, 'T-07')?.textContent).toContain(
      'Requires attention · Cannot start: its context entry requirements.md › Rate limits no longer exists',
    );
    // A draft is neutral (approving it is an action, not attention); waiting names its dependency.
    expect(row(container, 'T-04')?.dataset.taskAttention).toBeUndefined();
    expect(row(container, 'T-04')?.textContent).toContain('Draft · needs approval');
    expect(row(container, 'T-03')?.textContent).toContain('Waiting for T-02');
    // The progress is the section count; Cancelled is collapsed by its configuration.
    expect(screen.getByText('1 of 6 done · 1 cancelled · 1 on hold')).not.toBeNull();
    expect(row(container, 'T-06')).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('opens a collapsed group expanded when the Overview links to it', () => {
    const { container } = renderPage({ group: 'cancelled' });

    expect(row(container, 'T-06')).not.toBeNull();
  });

  it('shows the blocking filter with its count and clears it', () => {
    const { container, onClearBlocking } = renderPage({
      blocking: true,
      state: { status: 'ready', view: taskListViewOf(controlCenterTaskList('stuck', true)) },
    });
    const bar = container.querySelector<HTMLElement>('[data-blocking-filter]')!;

    expect(bar.textContent).toContain('Blocking specification · 2 tasks');
    expect(screen.getByText('2 of 7 shown')).not.toBeNull();
    expect(row(container, 'T-04')?.textContent).toContain(
      'Requires attention · the specification cannot continue until it moves',
    );
    fireEvent.click(
      within(bar).getByRole('button', { name: 'Clear filter: blocking specification' }),
    );
    expect(onClearBlocking).toHaveBeenCalledTimes(1);
  });

  it('says so when nothing blocks the Specification any more', () => {
    renderPage({
      blocking: true,
      state: { status: 'ready', view: taskListViewOf(controlCenterTaskList('waiting', true)) },
    });

    expect(screen.getByText('Nothing blocks the specification now')).not.toBeNull();
  });

  it('validates its search: one blocking value and a group id, anything else is the default', () => {
    expect(validateTasksSearch({ blocking: 'specification', group: 'on-hold' })).toEqual({
      collection: 'current',
      blocking: 'specification',
      group: 'on-hold',
    });
    expect(validateTasksSearch({ blocking: 'T-04,T-05', group: '../x' })).toEqual({
      collection: 'current',
    });
  });
});
