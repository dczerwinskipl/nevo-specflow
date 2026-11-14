import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Button,
  EmptyState,
  Icon,
  IconButton,
  InformationList,
  TextInput,
  Typography,
} from '@nevo/ui';
import { LoadingPresentation } from '../../../app/loading/LoadingPresentation';
import { WorkspaceSection } from '../../../shared/workspace-section';
import { progressText } from '../overview/progress';
import { getGroupTone } from './presentation';
import { TaskGroupHeader } from './TaskGroupHeader';
import { TaskRow } from './TaskRow';
import type { TaskListView } from './taskListModel';

export type TaskListState =
  | { readonly status: 'loading' }
  | { readonly status: 'failed'; readonly retry: () => void }
  | { readonly status: 'ready'; readonly view: TaskListView };

export interface TasksPageProps {
  readonly state: TaskListState;
  /** `?blocking=specification`: only the Tasks the Specification's `tasks-stuck` names. */
  readonly blocking: boolean;
  /** `?group=`: the group the page opens at, expanded. */
  readonly group?: string;
  readonly fullTaskHref: (taskId: string) => string;
  readonly onOpenTask: (taskId: string) => void;
  /** Clears the blocking filter (replaces the history entry). */
  readonly onClearBlocking: () => void;
  /** Present when the projection allows creating a Task. */
  readonly onNewTask?: () => void;
  /** A notice above the list (New task could not be checked). */
  readonly notice?: ReactNode;
}

const groupHeadingId = (groupId: string) => `task-group-${groupId}-heading`;

/**
 * The Tasks page (`/specs/:specId/tasks`): the full inventory in the Runtime's configured grouping,
 * as delivered. Collapsed groups follow the configuration; `group` opens one expanded and moves the
 * reader to it. Flagged rows carry the attention reason. No selection and no bulk actions.
 */
export function TasksPage({
  state,
  blocking,
  group: focusGroup,
  fullTaskHref,
  onOpenTask,
  onClearBlocking,
  onNewTask,
  notice,
}: TasksPageProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  // The person's own expand/collapse choices; the configuration decides the rest.
  const [toggled, setToggled] = useState<Readonly<Record<string, boolean>>>({});
  const ready = state.status === 'ready';

  // Arriving at a group (a link from the Overview): its heading takes the reader's focus.
  useEffect(() => {
    if (!ready || !focusGroup) {
      return;
    }

    const heading = document.getElementById(groupHeadingId(focusGroup));
    heading?.scrollIntoView({ block: 'start' });
    heading?.closest<HTMLElement>('[data-group-header]')?.querySelector('button')?.focus({
      preventScroll: true,
    });
  }, [ready, focusGroup]);

  const newTask = onNewTask ? (
    <Button size="sm" variant="secondary" leadingIcon="plus" onClick={onNewTask}>
      {t('taskAuthoring.tasks.newTask')}
    </Button>
  ) : null;

  if (state.status === 'loading') {
    return <LoadingPresentation shape="list" label={t('taskOverview.page.loading')} fetching />;
  }

  if (state.status === 'failed') {
    return (
      <Alert role="alert" tone="attention" title={t('taskOverview.page.failed')}>
        <Button variant="secondary" size="sm" onClick={state.retry}>
          {t('common.retry')}
        </Button>
      </Alert>
    );
  }

  const { view } = state;
  const needle = query.trim().toLowerCase();
  const groups = view.groups
    .map((group) => ({
      ...group,
      rows: needle
        ? group.rows.filter(
            (row) =>
              row.id.toLowerCase().includes(needle) ||
              (row.title ?? '').toLowerCase().includes(needle),
          )
        : group.rows,
    }))
    .filter((group) => group.rows.length > 0);
  const listed = view.groups.reduce((count, group) => count + group.rows.length, 0);
  const count = view.filter
    ? t('taskOverview.page.shown', { matched: view.filter.matched, total: view.filter.total })
    : view.progress && listed > 0
      ? progressText(view.progress, t)
      : undefined;
  const collapsed = (groupId: string, configured: boolean) =>
    toggled[groupId] ?? (groupId === focusGroup ? false : configured);

  return (
    <div className="grid gap-4" data-tasks-page="">
      <div className="grid max-w-content-standard gap-3">
        <TextInput
          aria-label={t('taskOverview.page.filterLabel')}
          placeholder={t('taskOverview.page.filterPlaceholder')}
          className="max-w-sm"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {blocking ? (
          <div
            role="status"
            className="flex w-fit max-w-full items-center gap-2 rounded-control border border-border-default bg-surface-subtle py-1 pr-1 pl-3"
            data-blocking-filter=""
          >
            <Icon name="filter" size="sm" aria-hidden="true" />
            <Typography as="span" variant="label-sm" className="min-w-0">
              {view.filter && view.filter.matched > 0
                ? t('taskOverview.page.blocking', { count: view.filter.matched })
                : t('taskOverview.page.nothingBlocks')}
            </Typography>
            <IconButton
              icon="close"
              size="xs"
              variant="ghost"
              aria-label={t('taskOverview.page.clearBlocking')}
              onClick={onClearBlocking}
            />
          </div>
        ) : null}
      </div>
      {notice}
      <WorkspaceSection aria-labelledby="tasks-heading">
        <WorkspaceSection.Header
          id="tasks-heading"
          headingTag="h2"
          title={t('specification.tasksHeading')}
          icon="list-checks"
          count={count}
          actions={newTask}
        />
        {listed === 0 && !blocking ? (
          <EmptyState
            variant="inline"
            title={t('specification.tasksEmptyTitle')}
            description={
              onNewTask
                ? t('taskAuthoring.tasks.emptyDescription')
                : t('specification.tasksEmptyDescription')
            }
          />
        ) : groups.length === 0 && needle ? (
          <Typography variant="body-sm" className="text-content-secondary">
            {t('taskOverview.page.noMatch')}
          </Typography>
        ) : (
          <div className="grid gap-4">
            {groups.map((group) => {
              const isCollapsed = collapsed(group.id, group.collapsed);
              const listId = `task-group-${group.id}`;

              return (
                <div key={group.id} className="grid gap-1" data-task-group={group.id}>
                  <div id={groupHeadingId(group.id)} data-group-header="">
                    <TaskGroupHeader
                      name={group.name}
                      count={group.rows.length}
                      isCollapsed={isCollapsed}
                      tone={getGroupTone(group)}
                      controlsId={listId}
                      onToggle={() =>
                        setToggled((previous) => ({ ...previous, [group.id]: !isCollapsed }))
                      }
                    />
                  </div>
                  {!isCollapsed ? (
                    <InformationList id={listId}>
                      {group.rows.map((row) => (
                        <TaskRow
                          key={row.id}
                          row={row}
                          fullTaskHref={fullTaskHref(row.id)}
                          onOpen={onOpenTask}
                        />
                      ))}
                    </InformationList>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </WorkspaceSection>
    </div>
  );
}
