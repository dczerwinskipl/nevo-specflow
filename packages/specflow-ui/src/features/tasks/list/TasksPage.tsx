import { useState, type ReactNode } from 'react';
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
  cn,
} from '@nevo/ui';
import { LoadingPresentation } from '../../../app/loading/LoadingPresentation';
import {
  CollectionColumns,
  collectionContainer,
  collectionTitleTrackMaxWidth,
} from '../../../shared/operational-list';
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
  /**
   * `?group=<groupId>` (the Overview's "N more in <group>"): only the Tasks of that group, which the
   * page opens expanded. Never together with `blocking`.
   */
  readonly group?: string;
  readonly fullTaskHref: (taskId: string) => string;
  readonly onOpenTask: (taskId: string) => void;
  /** Clears the filter, blocking or group (replaces the history entry). */
  readonly onClearFilter: () => void;
  /** Present when the projection allows creating a Task. */
  readonly onNewTask?: () => void;
  /** A notice above the list (New task could not be checked). */
  readonly notice?: ReactNode;
  /** When the first Tasks appear (the workflow's step that produces them), for the empty list. */
  readonly emptyLine?: string;
  /** The Specification's title, named by a row its `tasks-stuck` keeps waiting. */
  readonly specificationTitle?: string;
}

const groupHeadingId = (groupId: string) => `task-group-${groupId}-heading`;

/**
 * The Tasks page (`/specs/:specId/tasks`): the full inventory in the Runtime's configured grouping,
 * as delivered, on the Specifications list pattern (the collection's `task` tracks with a Task |
 * Status column header from 48rem, stacked rows below it). Collapsed groups follow the
 * configuration; a `group` filter lists that group's rows only, without a group header (the chip
 * names it). The active filter (blocking or group) is a removable chip. Flagged rows carry the attention
 * overlay under their status. No selection and no bulk actions.
 */
export function TasksPage({
  state,
  blocking,
  group: focusGroup,
  fullTaskHref,
  onOpenTask,
  onClearFilter,
  onNewTask,
  notice,
  emptyLine,
  specificationTitle,
}: TasksPageProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  // The person's own expand/collapse choices; the configuration decides the rest.
  const [toggled, setToggled] = useState<Readonly<Record<string, boolean>>>({});

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
  const matched = view.filter?.matched ?? 0;
  // The group's name is the Runtime's (the one group listed); none when nothing matches now.
  const groupName = focusGroup
    ? view.groups.find((group) => group.id === focusGroup)?.name
    : undefined;
  const filterChip = blocking
    ? {
        text:
          matched > 0
            ? t('taskOverview.page.blocking', { count: matched })
            : t('taskOverview.page.nothingBlocks'),
        clear: t('taskOverview.page.clearBlocking'),
      }
    : focusGroup
      ? {
          // The name only: the section count says how many ("1 of 5 shown").
          text: groupName ?? t('taskOverview.page.groupUnnamed'),
          clear: groupName
            ? t('taskOverview.page.clearGroup', { group: groupName })
            : t('taskOverview.page.clearGroupUnnamed'),
        }
      : undefined;
  const collapsed = (groupId: string, configured: boolean) => toggled[groupId] ?? configured;

  return (
    <div className="grid gap-4" data-tasks-page="">
      {/* As wide as the title track the filter matches against (the Specifications list's search). */}
      <div className={cn('grid w-full gap-3', collectionTitleTrackMaxWidth)}>
        <TextInput
          aria-label={t('taskOverview.page.filterLabel')}
          placeholder={t('taskOverview.page.filterPlaceholder')}
          className="w-full"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {filterChip ? (
          <div
            role="status"
            className="flex w-fit max-w-full items-center gap-2 rounded-control border border-border-default bg-surface-subtle py-1 pr-1 pl-3"
            {...(blocking ? { 'data-blocking-filter': '' } : { 'data-group-filter': focusGroup })}
          >
            <Icon name="filter" size="sm" aria-hidden="true" />
            <Typography as="span" variant="label-sm" className="min-w-0">
              {filterChip.text}
            </Typography>
            <IconButton
              icon="close"
              size="xs"
              variant="ghost"
              aria-label={filterChip.clear}
              onClick={onClearFilter}
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
        {listed === 0 && !filterChip ? (
          <EmptyState
            variant="inline"
            title={t('specification.tasksEmptyTitle')}
            // When the workflow's Tasks appear, and that New task creates them sooner when offered.
            description={
              onNewTask
                ? [emptyLine, t('taskAuthoring.tasks.emptyDescription')].filter(Boolean).join(' ')
                : (emptyLine ?? t('specification.tasksEmptyDescription'))
            }
          />
        ) : groups.length === 0 && (needle || focusGroup) ? (
          <Typography variant="body-sm" className="text-content-secondary">
            {needle ? t('taskOverview.page.noMatch') : t('taskOverview.page.groupEmpty')}
          </Typography>
        ) : (
          <div
            className={cn(collectionContainer, 'grid min-w-0 gap-5 @min-[40rem]/collection:gap-6')}
          >
            <CollectionColumns
              tracks="task"
              labels={[t('taskOverview.page.taskColumn'), t('taskOverview.page.statusColumn')]}
            />
            {groups.map((group) => {
              const rows = (
                <InformationList id={`task-group-${group.id}`}>
                  {group.rows.map((row) => (
                    <TaskRow
                      key={row.id}
                      row={row}
                      fullTaskHref={fullTaskHref(row.id)}
                      onOpen={onOpenTask}
                      {...(specificationTitle ? { specificationTitle } : {})}
                    />
                  ))}
                </InformationList>
              );
              if (focusGroup) {
                // Filtered to one group: its rows only, the chip names the group.
                return (
                  <div key={group.id} className="grid min-w-0" data-task-group={group.id}>
                    {rows}
                  </div>
                );
              }

              const isCollapsed = collapsed(group.id, group.collapsed);
              const listId = `task-group-${group.id}`;

              return (
                <div key={group.id} className="grid min-w-0 gap-2" data-task-group={group.id}>
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
                  {!isCollapsed ? rows : null}
                </div>
              );
            })}
          </div>
        )}
      </WorkspaceSection>
    </div>
  );
}
