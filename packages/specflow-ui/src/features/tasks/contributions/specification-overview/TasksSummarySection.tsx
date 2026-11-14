import type { MouseEvent } from 'react';
import { Alert, Button, InformationList, Link, Typography } from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import { FeatureUnavailable } from '../../../../app/errors/FeatureUnavailable';
import { OperationalRow } from '../../../../shared/operational-list';
import { WorkspaceSection } from '../../../../shared/workspace-section';
import type { SpecificationWorkSectionContext } from '../../../specs';

/** Whether the Overview shows the Tasks summary: Tasks exist, or their read failed. */
export function tasksSummaryVisible({ data }: Pick<SpecificationWorkSectionContext, 'data'>) {
  const availability = data.sectionAvailability?.tasks;
  if (availability !== undefined && availability !== 'available') {
    return true;
  }

  const overview = data.taskOverview;

  return Boolean(overview && (overview.rows.length > 0 || overview.compact.length > 0));
}

/**
 * The Overview's Tasks: a preview of the Runtime's configured grouping, rendered as delivered. A
 * `row` group has a row (name, count, up to two Tasks; a Task already named by Requires attention
 * or Now comes by id only), opening the Tasks page at that group; `compact` groups share one quiet
 * line of links. The full inventory, New task and the row actions are on the Tasks page.
 */
export function TasksSummarySection({ specId, data, actions }: SpecificationWorkSectionContext) {
  const { t } = useTranslation();
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

  const overview = data.taskOverview;
  if (!overview) {
    return null;
  }

  const openGroup = (group: string) => (event?: MouseEvent) => {
    event?.preventDefault();
    actions.openTasks({ group });
  };

  return (
    <WorkspaceSection aria-labelledby="tasks-summary-heading" data-tasks-summary="">
      <WorkspaceSection.Header
        id="tasks-summary-heading"
        title={t('specification.tasksHeading')}
        icon="list-checks"
        actions={
          <Button variant="ghost" size="sm" onClick={() => actions.openTasks()}>
            {t('taskOverview.summary.allTasks')}
          </Button>
        }
      />
      {overview.rows.length > 0 ? (
        <InformationList>
          {overview.rows.map((row) => {
            const parts = [
              t('taskOverview.summary.count', { count: row.count }),
              ...row.tasks.map((task) => (task.title ? `${task.id} ${task.title}` : task.id)),
              ...(row.more > 0 ? [t('taskOverview.summary.more', { count: row.more })] : []),
            ];

            return (
              <OperationalRow
                key={row.groupId}
                primary={row.name}
                primaryHref={actions.tasksHref({ group: row.groupId })}
                onPrimaryClick={openGroup(row.groupId)}
                primaryAriaLabel={t('taskOverview.summary.openGroup', { group: row.name })}
                supporting={<span className="block truncate">{parts.join(' · ')}</span>}
                dataAttributes={{ 'data-summary-group': row.groupId }}
              />
            );
          })}
        </InformationList>
      ) : null}
      {overview.compact.length > 0 ? (
        <Typography as="p" variant="body-sm" className="text-content-secondary">
          {overview.compact.map((group, index) => (
            <span key={group.groupId}>
              {index > 0 ? ' · ' : null}
              <Link
                href={actions.tasksHref({ group: group.groupId })}
                onClick={openGroup(group.groupId)}
                data-summary-group={group.groupId}
              >
                {t('taskOverview.summary.compact', { group: group.name, count: group.count })}
              </Link>
            </span>
          ))}
        </Typography>
      ) : null}
    </WorkspaceSection>
  );
}
