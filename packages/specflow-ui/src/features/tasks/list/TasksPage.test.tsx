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

  it('lays the rows on the Task | Status columns: status kept, one supporting line', () => {
    const { container } = renderPage();
    const status = (taskId: string) =>
      row(container, taskId)!.querySelector<HTMLElement>('[data-task-status-cell]')!;

    expect(container.querySelector('[data-collection-columns="task"]')?.textContent).toBe(
      'TaskStatus',
    );
    expect(row(container, 'T-05')!.querySelector('[data-task-identity]')?.textContent).toBe(
      'T-05·Backend',
    );
    // On hold: the label once, then the reason verbatim as the supporting line.
    expect(status('T-05').querySelector('p')?.textContent).toBe(
      'Waiting for the retention policy from the security team.',
    );
    expect(status('T-05').textContent).toBe(
      'On holdWaiting for the retention policy from the security team.',
    );
    // A flagged row keeps its status; the overlay is added under it.
    expect(status('T-07').textContent).toMatch(/^BlockedRequires attention · Cannot start/);
    expect(row(container, 'T-07')?.dataset.taskAttention).toBe('true');
    expect(row(container, 'T-07')?.querySelector('[data-mark-slot="empty"]')).not.toBeNull();
  });

  it('renders a Specification item that names the Task on its row, from the item only', () => {
    const response = controlCenterTaskList('waiting');
    const view = taskListViewOf({
      ...response,
      attention: [
        ...response.attention,
        {
          subject: { kind: 'specification', specId: response.specId },
          reason: 'task-escalated',
          actor: 'owner',
          action: 'return-to-step',
          message: 'T-05 escalated.',
          taskIds: ['T-05'],
        },
      ],
    });
    const { container } = renderPage({ state: { status: 'ready', view } });

    expect(row(container, 'T-05')?.dataset.taskAttention).toBe('true');
    expect(row(container, 'T-05')?.textContent).toContain(
      'On holdRequires attention · escalated to the specification: Waiting for the retention policy',
    );
    // Nothing else is derived: the other held or waiting rows stay plain.
    expect(row(container, 'T-03')?.dataset.taskAttention).toBeUndefined();
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

  it('holds the empty state and New task of a Specification without Tasks', () => {
    const onNewTask = vi.fn();
    renderPage({
      state: { status: 'ready', view: taskListViewOf(controlCenterTaskList('empty')) },
      onNewTask,
    });

    expect(screen.getByText('No tasks yet')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'New task' }));
    expect(onNewTask).toHaveBeenCalledTimes(1);
  });

  it('names the producing step and keeps the New task hint when both apply', () => {
    renderPage({
      state: { status: 'ready', view: taskListViewOf(controlCenterTaskList('empty')) },
      onNewTask: vi.fn(),
      emptyLine: 'Tasks appear when Plan (step 2 of 3) finishes.',
    });

    expect(
      screen.getByText(
        'Tasks appear when Plan (step 2 of 3) finishes. Create tasks with New task, also before the workflow starts.',
      ),
    ).not.toBeNull();
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
