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
  const onClearFilter = vi.fn();
  const view = render(
    <LocalizationProvider instance={createSpecFlowI18n('en')}>
      <TasksPage
        state={{ status: 'ready', view: taskListViewOf(controlCenterTaskList('waiting')) }}
        blocking={false}
        fullTaskHref={(taskId) => `/specs/sso/tasks/${taskId}`}
        onOpenTask={vi.fn()}
        onClearFilter={onClearFilter}
        {...props}
      />
    </LocalizationProvider>,
  );

  return { ...view, onClearFilter };
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
    expect(row(container, 'T-03')?.textContent).toContain(
      'Waiting for Token exchange endpoint and session cookie',
    );
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
    expect(status('T-07').textContent).toMatch(/^Cannot startRequires attention · Cannot start/);
    expect(row(container, 'T-07')?.dataset.taskAttention).toBe('true');
    expect(row(container, 'T-07')?.querySelector('[data-mark-slot="empty"]')).not.toBeNull();
  });

  it('renders the attention the Runtime puts on the row, never the response list', () => {
    const response = controlCenterTaskList('waiting');
    const escalation = {
      subject: { kind: 'specification' as const, specId: response.specId },
      reason: 'task-escalated' as const,
      actor: 'owner' as const,
      action: 'return-to-step' as const,
      message: 'T-05 escalated.',
      taskIds: ['T-05'],
    };
    const view = taskListViewOf({
      ...response,
      // The response list names T-03 too: the row (resolved by the Runtime) is the one source.
      attention: [...response.attention, { ...escalation, taskIds: ['T-03'] }],
      groups: response.groups.map((group) => ({
        ...group,
        tasks: group.tasks.map((task) =>
          task.id === 'T-05' ? { ...task, attention: escalation } : task,
        ),
      })),
    });
    const { container } = renderPage({ state: { status: 'ready', view } });

    expect(row(container, 'T-05')?.dataset.taskAttention).toBe('true');
    expect(row(container, 'T-05')?.textContent).toContain(
      'On holdRequires attention · escalated to the specification: Waiting for the retention policy',
    );
    expect(row(container, 'T-03')?.dataset.taskAttention).toBeUndefined();
  });

  it('says what a broken row cannot do once, without a bare Requires attention line', () => {
    const { container } = renderPage({
      state: { status: 'ready', view: taskListViewOf(controlCenterTaskList('blocked')) },
    });
    const broken = row(container, 'T-07')!;

    expect(broken.dataset.taskAttention).toBe('true');
    expect(broken.querySelector('[data-task-status-cell]')?.textContent).toBe(
      'Cannot start · files broken',
    );
  });

  it('lists one group with a clearable group filter (the Overview "N more")', () => {
    const { container, onClearFilter } = renderPage({
      group: 'cancelled',
      state: {
        status: 'ready',
        view: taskListViewOf(controlCenterTaskList('waiting', { group: 'cancelled' })),
      },
    });
    const chip = container.querySelector<HTMLElement>('[data-group-filter="cancelled"]')!;

    // Collapsed by its configuration, listed by the filter: rows only, no group header to toggle.
    expect(row(container, 'T-06')).not.toBeNull();
    expect(container.querySelectorAll('[data-row-task]')).toHaveLength(1);
    expect(container.querySelector('[data-group-header]')).toBeNull();
    // The chip names the group; the section count is the one count.
    expect(chip.textContent).toBe('Cancelled');
    expect(screen.getByText('1 of 7 shown')).not.toBeNull();
    expect(document.activeElement).toBe(document.body);
    fireEvent.click(within(chip).getByRole('button', { name: 'Clear filter: Cancelled' }));
    expect(onClearFilter).toHaveBeenCalledTimes(1);
  });

  it('keeps the hold reason of a held row under its Requires attention overlay', () => {
    const response = controlCenterTaskList('waiting');
    const held = {
      subject: { kind: 'task' as const, specId: response.specId, taskId: 'T-05' },
      reason: 'on-hold-blocking' as const,
      actor: 'owner' as const,
      action: 'resume-task' as const,
      message: 'T-05 holds up T-03.',
      blocks: { taskIds: ['T-03'] },
    };
    const view = taskListViewOf({
      ...response,
      groups: response.groups.map((group) => ({
        ...group,
        tasks: group.tasks.map((task) =>
          task.id === 'T-05' ? { ...task, attention: held } : task,
        ),
      })),
    });
    const { container } = renderPage({ state: { status: 'ready', view } });
    const cell = row(container, 'T-05')!.querySelector('[data-task-status-cell]')!;

    expect(cell.querySelector('[data-task-overlay]')?.textContent).toBe(
      'Requires attention · holds up Sign-in button and provider redirect',
    );
    expect(cell.querySelector('[data-collection-supporting]')?.textContent).toBe(
      'Waiting for the retention policy from the security team.',
    );
  });

  it('shows the blocking filter with its count and clears it', () => {
    const { container, onClearFilter } = renderPage({
      blocking: true,
      state: {
        status: 'ready',
        view: taskListViewOf(controlCenterTaskList('stuck', { blocking: 'specification' })),
      },
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
    expect(onClearFilter).toHaveBeenCalledTimes(1);
  });

  it('counts the rows on screen under a filter, the chip keeps the Runtime count', () => {
    const view = taskListViewOf(controlCenterTaskList('stuck', { blocking: 'specification' }));
    const { container } = renderPage({
      blocking: true,
      // The Runtime counts a blocking Task the list holds no row for (for example a broken one).
      state: { status: 'ready', view: { ...view, filter: { ...view.filter!, matched: 3 } } },
    });

    expect(container.querySelectorAll('[data-row-task]')).toHaveLength(2);
    expect(screen.getByText('2 of 7 shown')).not.toBeNull();
    expect(container.querySelector('[data-blocking-filter]')?.textContent).toContain(
      'Blocking specification · 3 tasks',
    );
  });

  it('counts the rows the search leaves, under a filter or without one', () => {
    const { container } = renderPage({
      blocking: true,
      state: {
        status: 'ready',
        view: taskListViewOf(controlCenterTaskList('stuck', { blocking: 'specification' })),
      },
    });
    const search = screen.getByRole('textbox', { name: 'Filter tasks' });

    fireEvent.change(search, { target: { value: 'audit' } });
    expect(container.querySelectorAll('[data-row-task]')).toHaveLength(1);
    expect(screen.getByText('1 of 7 shown')).not.toBeNull();
    // The chip keeps the filter's own count.
    expect(container.querySelector('[data-blocking-filter]')?.textContent).toContain(
      'Blocking specification · 2 tasks',
    );
    fireEvent.change(search, { target: { value: 'nothing like this' } });
    expect(screen.getByText('0 of 7 shown')).not.toBeNull();
    expect(screen.getByText('No task matches the filter.')).not.toBeNull();

    cleanup();
    renderPage();
    fireEvent.change(screen.getByRole('textbox', { name: 'Filter tasks' }), {
      target: { value: 'sign-in' },
    });
    expect(screen.getByText('2 of 7 shown')).not.toBeNull();
  });

  it('opens the groups a search matches in, then restores the collapse once it is cleared', () => {
    const { container } = renderPage();
    const search = screen.getByRole('textbox', { name: 'Filter tasks' });
    // Done collapsed by the person, Cancelled by its configuration.
    fireEvent.click(screen.getByRole('button', { name: 'Collapse Done section' }));
    expect(row(container, 'T-01')).toBeNull();
    expect(row(container, 'T-06')).toBeNull();

    fireEvent.change(search, { target: { value: 'saml' } });
    expect(row(container, 'T-06')).not.toBeNull();
    const toggle = screen.getByRole('button', {
      name: 'Cancelled section expanded while search is active',
    });
    expect(toggle.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(toggle);
    expect(row(container, 'T-06')).not.toBeNull();
    fireEvent.change(search, { target: { value: 'identity provider' } });
    expect(row(container, 'T-01')).not.toBeNull();

    fireEvent.change(search, { target: { value: '' } });
    expect(row(container, 'T-01')).toBeNull();
    expect(row(container, 'T-06')).toBeNull();
    expect(screen.getByRole('button', { name: 'Expand Cancelled section' })).not.toBeNull();
  });

  it('holds the empty state and New task of a Specification without Tasks', () => {
    const onNewTask = vi.fn();
    renderPage({
      state: { status: 'ready', view: taskListViewOf(controlCenterTaskList('empty')) },
      onNewTask,
    });

    expect(screen.getByText('No tasks yet')).not.toBeNull();
    // Nothing to search yet.
    expect(screen.queryByRole('textbox', { name: 'Filter tasks' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'New task' }));
    expect(onNewTask).toHaveBeenCalledTimes(1);
  });

  it('names the producing step and keeps the New task hint when both apply', () => {
    renderPage({
      state: { status: 'ready', view: taskListViewOf(controlCenterTaskList('empty')) },
      onNewTask: vi.fn(),
      empty: {
        title: 'No tasks yet',
        line: 'The "Plan" step (2 of 3) creates the tasks.',
        ended: false,
      },
    });

    expect(screen.getByText('No tasks yet')).not.toBeNull();
    expect(
      screen.getByText(
        'The "Plan" step (2 of 3) creates the tasks. You can also create them now with New task.',
      ),
    ).not.toBeNull();
  });

  it('promises no tasks once the workflow ended', () => {
    renderPage({
      state: { status: 'ready', view: taskListViewOf(controlCenterTaskList('empty')) },
      empty: { title: 'No tasks were created', ended: true },
    });

    expect(screen.getByText('No tasks were created')).not.toBeNull();
    expect(screen.queryByText(/yet|appear here once/)).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Filter tasks' })).toBeNull();
  });

  it('says so when nothing blocks the Specification any more', () => {
    renderPage({
      blocking: true,
      state: {
        status: 'ready',
        view: taskListViewOf(controlCenterTaskList('waiting', { blocking: 'specification' })),
      },
    });

    expect(screen.getByText('Nothing blocks the specification now')).not.toBeNull();
  });

  it('validates its search: one filter (blocking wins), anything else is the default', () => {
    expect(validateTasksSearch({ group: 'on-hold' })).toEqual({
      collection: 'current',
      group: 'on-hold',
    });
    expect(validateTasksSearch({ blocking: 'specification', group: 'on-hold' })).toEqual({
      collection: 'current',
      blocking: 'specification',
    });
    expect(validateTasksSearch({ blocking: 'T-04,T-05', group: '../x' })).toEqual({
      collection: 'current',
    });
  });
});
