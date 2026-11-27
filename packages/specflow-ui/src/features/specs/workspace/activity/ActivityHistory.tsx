import { Button, EmptyState, Icon, Timeline, Typography } from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import { FeatureUnavailable } from '../../../../app/errors/FeatureUnavailable';
import type { ActivityEvent } from '../../read-model/model';
import { TaskActivityItem } from './TaskActivityItem';
import { SessionActivityItem } from './SessionActivityItem';
import { DocumentActivityItem } from './DocumentActivityItem';
import { InformationalActivityItem } from './InformationalActivityItem';
import { presentActivityEvent } from './presentActivity';
import { useNow } from '../../../../shared/operations/panel/relativeTime';
import {
  historyDay,
  WorkflowHistoryEntry,
  type AttemptRef,
  type useSpecificationWorkflowTimeline,
} from '../../../tasks';
import { activityDays, composeActivityTimeline, type ActivityTimelineEntry } from './timeline';
import { productIcons } from '../../../../shared/product-icons';

const DATE_TIME = /^\d{4}-\d{2}-\d{2}T/u;

/** The Specification's workflow entries and what they need to render. */
export type ActivityWorkflow = ReturnType<typeof useSpecificationWorkflowTimeline> & {
  readonly specId: string;
  /** The attempt whose feedback the reader opened ("Open full feedback"): its entry opens it. */
  readonly feedback?: AttemptRef | undefined;
};

export interface ActivityHistoryProps {
  readonly showHeading?: boolean;
  readonly events: readonly ActivityEvent[];
  /** The workflow history's entries, merged into the same timeline; absent: events only. */
  readonly workflow?: ActivityWorkflow;
  /** Availability of the activity source. Unavailable/forbidden is not an empty history. */
  readonly availability?: 'available' | 'unavailable' | 'forbidden';
  /** `not_implemented` is permanent for this Runtime: a calm state, never a failure. */
  readonly unavailableReason?:
    'not_implemented' | 'source_unavailable' | 'source_busy' | 'source_recovery';
  /** Re-reads the activity source; offered only for an unavailable source. */
  readonly onRetry?: () => void;
  readonly onOpenTask?: (taskId: string) => void;
  readonly onOpenSession?: (sessionId: string) => void;
  readonly onOpenDoc?: (docId: string) => void;
}

export function ActivityHistory({
  showHeading = true,
  events,
  workflow,
  availability = 'available',
  unavailableReason,
  onRetry,
  onOpenTask,
  onOpenSession,
  onOpenDoc,
}: ActivityHistoryProps) {
  const { t, i18n } = useTranslation();
  const now = useNow();
  const entries = composeActivityTimeline(
    workflow ?? { entries: [], sessionIds: new Set<string>() },
    availability === 'available' ? events : [],
  );
  const today = new Date(now);

  const renderEntry = (entry: ActivityTimelineEntry) => {
    if (entry.kind === 'workflow') {
      return workflow ? (
        <WorkflowHistoryEntry
          key={entry.key}
          entry={entry.entry}
          items={workflow.items}
          specId={workflow.specId}
          openDocument={workflow.openDocument}
          feedback={workflow.feedback}
        />
      ) : null;
    }

    const shown = presentActivityEvent(entry.event, t, now, i18n.language);
    // The day is the group's heading: a date-time says its time of day, a date nothing more.
    const time = DATE_TIME.test(entry.event.time)
      ? new Intl.DateTimeFormat(i18n.language, { timeStyle: 'short' }).format(
          new Date(entry.event.time),
        )
      : entry.event.time.length === 10
        ? undefined
        : shown.time;
    const event = { ...shown, time: time ?? '' };

    switch (event.kind) {
      case 'task':
        return <TaskActivityItem key={entry.key} event={event} onOpenTask={onOpenTask} />;
      case 'session':
        return <SessionActivityItem key={entry.key} event={event} onOpenSession={onOpenSession} />;
      case 'doc':
        return <DocumentActivityItem key={entry.key} event={event} onOpenDoc={onOpenDoc} />;
      case 'info':
        return <InformationalActivityItem key={entry.key} event={event} />;
      default: {
        const _exhaustive: never = event;
        void _exhaustive;

        return null;
      }
    }
  };

  const unavailable =
    availability === 'unavailable' && unavailableReason === 'not_implemented' ? (
      <FeatureUnavailable className="border-none" />
    ) : availability !== 'available' ? (
      <EmptyState
        icon={productIcons.history}
        title={t(
          availability === 'forbidden'
            ? 'specification.activityHistoryForbiddenTitle'
            : 'specification.activityHistoryUnavailableTitle',
        )}
        description={t(
          availability === 'forbidden'
            ? 'specification.activityHistoryForbiddenDescription'
            : 'specification.activityHistoryUnavailableDescription',
        )}
        actions={
          availability === 'unavailable' && onRetry ? (
            <Button variant="secondary" size="sm" onClick={onRetry}>
              {t('common.retry')}
            </Button>
          ) : undefined
        }
        className="border-none"
      />
    ) : null;

  return (
    <aside className="grid min-w-0 gap-3 p-4" aria-label={t('specification.historyAriaLabel')}>
      {showHeading ? (
        <div>
          <Typography
            as="h3"
            variant="title-sm"
            className="flex items-center gap-2 text-content-primary"
          >
            <Icon name={productIcons.history} size="sm" className="text-content-muted" />
            <span>{t('specification.activityHistory')}</span>
          </Typography>
          <Typography variant="body-sm" className="mt-0.5 text-content-muted">
            {t('specification.thisSpecification')}
          </Typography>
        </div>
      ) : null}

      {/* One chronological timeline, newest first and grouped by day. */}
      {activityDays(entries).map((group) => (
        <div key={group.key} className="grid min-w-0 gap-2" data-activity-day="">
          {group.day ? (
            <Typography
              as="p"
              variant="label-sm"
              className="uppercase tracking-wide text-content-muted"
            >
              {historyDay(t, group.day, i18n.language, today)}
            </Typography>
          ) : null}
          <Timeline size="md">{group.entries.map(renderEntry)}</Timeline>
        </div>
      ))}
      {workflow?.truncated ? (
        <Typography as="p" variant="body-sm" className="text-content-muted">
          {t('workflowExecution.attemptHistory.truncated')}
        </Typography>
      ) : null}

      {unavailable ??
        (entries.length === 0 ? (
          <EmptyState
            icon={productIcons.history}
            title={t('specification.activityHistoryEmptyTitle')}
            description={t('specification.activityHistoryEmptyDescription')}
            className="border-none"
          />
        ) : null)}
    </aside>
  );
}
