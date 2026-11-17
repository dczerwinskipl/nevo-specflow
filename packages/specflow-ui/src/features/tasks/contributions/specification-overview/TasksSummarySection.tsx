import type { MouseEvent } from 'react';
import {
  Alert,
  Button,
  EmptyState,
  InformationList,
  Link,
  MenuItem,
  OverflowMenu,
  Typography,
  cn,
} from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import { FeatureUnavailable } from '../../../../app/errors/FeatureUnavailable';
import { collectionContainer } from '../../../../shared/operational-list';
import { WorkspaceSection } from '../../../../shared/workspace-section';
import type { SpecificationWorkSectionContext } from '../../../specs';
import { useSpecificationWorkflow } from '../../execution/specification/SpecificationWorkflow';
import { TaskRow } from '../../list/TaskRow';
import { taskRowViewOf } from '../../list/taskListModel';
import { tasksStepLine } from '../../overview/tasksStepLine';

/** A plain click opens in the app; a modified click keeps the browser's own behaviour. */
const plainClick = (event: MouseEvent) =>
  !(event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0);

/**
 * The Overview's Tasks: the Runtime's preview of its configured grouping, rendered as delivered.
 * Every `row` group shows its first Tasks (the Runtime picks them in importance order) as the Tasks
 * page's own `TaskRow`, on the same tracks without a column header (stacked below 48rem of
 * section width), then "N more in <group>" opening the Tasks page filtered to that group. There
 * are no group headers: each row's status names its group. `compact` groups share one quiet line
 * of links. The header keeps All tasks, with New task in its overflow when the projection allows
 * it. Without Tasks the section keeps its place with the line naming the workflow step that
 * produces them, and a quiet New task.
 */
export function TasksSummarySection({ specId, data, actions }: SpecificationWorkSectionContext) {
  const { t } = useTranslation();
  const workflow = useSpecificationWorkflow();
  const availability = data.sectionAvailability?.tasks;
  if (
    availability === 'unavailable' &&
    data.sectionUnavailableReason?.tasks === 'not_implemented'
  ) {
    return <FeatureUnavailable className="border-none" />;
  }

  if (availability === 'forbidden' || availability === 'unavailable') {
    return (
      <Alert tone="attention" title={t('specification.unavailableTitle')}>
        {t('specification.unavailableDescription', { id: specId })}
      </Alert>
    );
  }

  const openNewTask = workflow?.openNewTask;
  const header = (
    <WorkspaceSection.Header
      id="tasks-summary-heading"
      headingTag="h2"
      title={t('specification.tasksHeading')}
      icon="list-checks"
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
              <span>
                {tasksStepLine(t, workflow?.projection?.outline) ??
                  t('specification.tasksEmptyTitle')}
              </span>
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
      <div className={cn(collectionContainer, 'grid min-w-0 divide-y divide-border-subtle')}>
        {overview.rows.map((row) => (
          <div key={row.groupId} className="grid min-w-0" data-summary-group={row.groupId}>
            <InformationList aria-label={row.name}>
              {row.tasks.map((entry) => (
                <TaskRow
                  key={entry.id}
                  row={taskRowViewOf(entry)}
                  fullTaskHref={actions.fullTaskHref(entry.id)}
                  onOpen={(taskId) => actions.openTask(taskId)}
                  specificationTitle={data.title}
                />
              ))}
            </InformationList>
            {row.more > 0 ? (
              <Typography as="p" variant="body-sm" className="px-2 pb-2">
                <Link
                  tone="muted"
                  href={actions.tasksHref({ group: row.groupId })}
                  onClick={openGroup(row.groupId)}
                  data-summary-more={row.groupId}
                >
                  {/* The Runtime's group name, as configured: no copy of the UI's own. */}
                  {t('taskOverview.summary.moreIn', { count: row.more, group: row.name })}
                </Link>
              </Typography>
            ) : null}
          </div>
        ))}
        {overview.compact.length > 0 ? (
          <Typography as="p" variant="body-sm" className="px-2 py-2 text-content-secondary">
            {overview.compact.map((group, index) => (
              <span key={group.groupId}>
                {index > 0 ? ' · ' : null}
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
