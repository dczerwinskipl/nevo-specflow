import type { MouseEvent } from 'react';
import {
  Alert,
  Button,
  EmptyState,
  InformationList,
  Link,
  MenuItem,
  OverflowMenu,
  StatusIndicator,
  Typography,
  cn,
} from '@nevo/ui';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import type { WorkflowActionProjection } from '@nevo/specflow-contracts/workflow';
import { FeatureUnavailable } from '../../../../app/errors/FeatureUnavailable';
import { collectionContainer } from '../../../../shared/operational-list';
import { WorkspaceSection } from '../../../../shared/workspace-section';
import type { SpecificationWorkSectionContext } from '../../../specs';
import { useSpecificationWorkflow } from '../../execution/specification/SpecificationWorkflow';
import { TaskRow } from '../../list/TaskRow';
import { taskRowViewOf } from '../../list/taskListModel';
import { getGroupTone } from '../../list/presentation';
import { emptyTasks } from '../../overview/tasksStepLine';
import { productIcons } from '../../../../shared/product-icons';
import { unreadableCauseOfSection, unreadableCopy } from '../../../../shared/unreadable/unreadable';

/** A plain click opens in the app; a modified click keeps the browser's own behaviour. */
const plainClick = (event: MouseEvent) =>
  !(event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0);

/**
 * The line of a Tasks section without Tasks: when the workflow creates them, else "No tasks yet";
 * a workflow that ended creates no more, so it never says "yet" there.
 */
export function emptyTasksLine(
  t: TFunction,
  projection: WorkflowActionProjection | undefined,
): string {
  const empty = emptyTasks(t, projection);

  return empty.line ?? empty.title;
}

/**
 * The Overview's Tasks:the Runtime's preview of its configured grouping, rendered as delivered.
 * Every `row` group shows its first Tasks (the Runtime picks them in importance order) as the Tasks
 * page's own `TaskRow`, on the same tracks without a column header (stacked below 48rem of
 * section width) under the group's name and count, then "Show N more" opening the Tasks page
 * filtered to that group. A row says its state only when it adds to the group's name ("Waiting
 * for 4 other tasks") and leaves the Task's key to the Tasks page. `compact` groups share one quiet line
 * of links. The header keeps All tasks, with New task in its overflow when the projection allows
 * it. Without Tasks the section keeps its place with the line naming the workflow step that
 * produces them, and a quiet New task.
 */
export function TasksSummarySection({ data, actions }: SpecificationWorkSectionContext) {
  const { t } = useTranslation();
  const workflow = useSpecificationWorkflow();
  const availability = data.sectionAvailability?.tasks;
  if (
    availability === 'unavailable' &&
    data.sectionUnavailableReason?.tasks === 'not_implemented'
  ) {
    return <FeatureUnavailable className="border-none" />;
  }

  if (availability === 'forbidden') {
    return (
      <Alert tone="attention" title={t('specification.resourceAccessDeniedTitle')}>
        {t('specification.resourceAccessDeniedDescription')}
      </Alert>
    );
  }

  if (availability === 'unavailable') {
    // The Runtime could not read the Tasks now: `source_busy` (busy or recovering from a stop) or
    // `source_unavailable` (also a file it cannot read). Transient, so it says so and offers Retry.
    return (
      <Alert tone="attention" role="status" title={t('specification.tasksUnreadableTitle')}>
        <p>
          {t(
            unreadableCopy(unreadableCauseOfSection(data.sectionUnavailableReason?.tasks))
              .description,
          )}
        </p>
        <Button
          className="mt-3"
          variant="secondary"
          size="sm"
          onClick={() => void actions.refresh()}
        >
          {t('common.retry')}
        </Button>
      </Alert>
    );
  }

  const openNewTask = workflow?.openNewTask;
  const header = (
    <WorkspaceSection.Header
      id="tasks-summary-heading"
      headingTag="h2"
      title={t('specification.tasksHeading')}
      icon={productIcons.task.collection}
      actions={
        <>
          <Button variant="ghost" size="sm" onClick={() => actions.openTasks()}>
            {t('taskOverview.summary.allTasks')}
          </Button>
          {openNewTask ? (
            <OverflowMenu
              label={t('specification.tasksHeading')}
              triggerLabel={t('taskOverview.summary.moreActions')}
            >
              <MenuItem leadingIcon="plus" onSelect={openNewTask}>
                {t('taskAuthoring.tasks.newTask')}
              </MenuItem>
            </OverflowMenu>
          ) : null}
        </>
      }
    />
  );

  const overview = data.taskOverview;
  if (!overview || (overview.rows.length === 0 && overview.compact.length === 0)) {
    return (
      <WorkspaceSection aria-labelledby="tasks-summary-heading" data-tasks-summary="">
        {header}
        <EmptyState
          variant="inline"
          title={
            <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span>{emptyTasksLine(t, workflow?.projection)}</span>
              {openNewTask ? (
                <Button variant="ghost" size="sm" leadingIcon="plus" onClick={openNewTask}>
                  {t('taskAuthoring.tasks.newTask')}
                </Button>
              ) : null}
            </span>
          }
        />
      </WorkspaceSection>
    );
  }

  // The titles of the Tasks the rows' facts name (the Runtime's `taskTitles`, also for a Task the
  // preview does not list), else of the Tasks the preview shows: "Waiting for <title>".
  const titles = new Map(
    overview.rows.flatMap((row) => row.tasks.map((entry) => [entry.id, entry.title] as const)),
  );
  const titleOf = (taskId: string) => overview.taskTitles?.[taskId] ?? titles.get(taskId);

  const openGroup = (group: string) => (event: MouseEvent) => {
    if (!plainClick(event)) {
      return;
    }

    event.preventDefault();
    actions.openTasks({ group });
  };

  return (
    <WorkspaceSection aria-labelledby="tasks-summary-heading" data-tasks-summary="">
      {header}
      {/*
       * One divider style throughout: the groups are divided like the rows inside them (the list
       * item's divider, on the same rounded box), so a group boundary reads like a row boundary.
       */}
      <div className={cn(collectionContainer, 'grid min-w-0 divide-y divide-border-subtle')}>
        {overview.rows.map((row) => {
          const views = row.tasks.map(taskRowViewOf);
          const headingId = `tasks-summary-group-${row.groupId}`;

          return (
            <section
              key={row.groupId}
              className="grid min-w-0 gap-1 rounded-control pt-3"
              aria-labelledby={headingId}
              data-summary-group={row.groupId}
            >
              {/* The group's name and count lead it: its rows never repeat the state. */}
              <div className="flex min-w-0 items-center gap-2 px-2">
                <span className="flex size-4 shrink-0 items-center justify-center">
                  <StatusIndicator
                    tone={getGroupTone({
                      id: row.groupId,
                      name: row.name,
                      collapsed: false,
                      rows: views,
                    })}
                  />
                </span>
                <Typography
                  as="h3"
                  id={headingId}
                  variant="label-sm"
                  className="font-semibold text-content-primary"
                >
                  {/* The Runtime's group name, as configured: no copy of the UI's own. */}
                  {row.name}
                </Typography>
                <Typography as="span" variant="body-sm" className="text-content-muted">
                  {row.count}
                </Typography>
              </div>
              <InformationList aria-labelledby={headingId}>
                {views.map((view) => (
                  <TaskRow
                    key={view.id}
                    row={view}
                    fullTaskHref={actions.fullTaskHref(view.id)}
                    onOpen={(taskId) => actions.openTask(taskId)}
                    specificationTitle={data.title}
                    titleOf={titleOf}
                    inGroup
                  />
                ))}
              </InformationList>
              {row.more > 0 ? (
                <Typography as="p" variant="body-sm" className="px-2 pb-2">
                  {/* Inside its group, so "Show 3 more" needs no group name (owner, 2026-11-25). */}
                  <Link
                    href={actions.tasksHref({ group: row.groupId })}
                    onClick={openGroup(row.groupId)}
                    data-summary-more={row.groupId}
                    // Read on its own (a links list), the link still names its group.
                    aria-label={t('taskOverview.summary.moreIn', {
                      count: row.more,
                      group: row.name,
                    })}
                  >
                    {t('taskOverview.summary.showMore', { count: row.more })}
                  </Link>
                </Typography>
              ) : null}
            </section>
          );
        })}
        {overview.compact.length > 0 ? (
          <Typography
            as="p"
            variant="body-sm"
            className="rounded-control px-2 py-2 text-content-secondary"
          >
            {overview.compact.map((group, index) => (
              <span key={group.groupId}>
                {index > 0 ? ' · ' : null}
                {/* The same link as "Show N more tasks". */}
                <Link
                  href={actions.tasksHref({ group: group.groupId })}
                  onClick={openGroup(group.groupId)}
                  data-summary-group={group.groupId}
                >
                  {/* The Runtime's group name and its count: no copy of the UI's own. */}
                  {`${group.name} ${group.count}`}
                </Link>
              </span>
            ))}
          </Typography>
        ) : null}
      </div>
    </WorkspaceSection>
  );
}
