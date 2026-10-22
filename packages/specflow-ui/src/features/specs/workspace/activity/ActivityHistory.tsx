import { Button, EmptyState, Icon, Timeline, Typography } from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import { FeatureUnavailable } from '../../../../app/errors/FeatureUnavailable';
import type { ActivityEvent } from '../../read-model/model';
import { TaskActivityItem } from './TaskActivityItem';
import { SessionActivityItem } from './SessionActivityItem';
import { DocumentActivityItem } from './DocumentActivityItem';
import { InformationalActivityItem } from './InformationalActivityItem';

export interface ActivityHistoryProps {
  readonly showHeading?: boolean;
  readonly events: readonly ActivityEvent[];
  /** Availability of the activity source. Unavailable/forbidden is not an empty history. */
  readonly availability?: 'available' | 'unavailable' | 'forbidden';
  /** `not_implemented` is permanent for this Runtime: a calm state, never a failure. */
  readonly unavailableReason?: 'not_implemented' | 'source_unavailable';
  /** Re-reads the activity source; offered only for an unavailable source. */
  readonly onRetry?: () => void;
  readonly isExplicit?: boolean;
  readonly onClose?: () => void;
  readonly onOpenTask?: (taskId: string) => void;
  readonly onOpenSession?: (sessionId: string) => void;
  readonly onOpenDoc?: (docId: string) => void;
}

export function ActivityHistory({
  showHeading = true,
  events,
  availability = 'available',
  unavailableReason,
  onRetry,
  isExplicit = false,
  onClose,
  onOpenTask,
  onOpenSession,
  onOpenDoc,
}: ActivityHistoryProps) {
  const { t } = useTranslation();

  return (
    <aside className="flex flex-col p-5" aria-label={t('specification.historyAriaLabel')}>
      {showHeading ? (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <Typography
              as="h3"
              variant="title-sm"
              className="flex items-center gap-2 text-content-primary"
            >
              <Icon name="clock" size="sm" className="text-content-muted" />
              <span>{t('specification.activityHistory')}</span>
            </Typography>
            <Typography variant="body-sm" className="mt-0.5 text-content-muted">
              {t('specification.thisSpecification')}
            </Typography>
          </div>

          {isExplicit && onClose ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              aria-label={t('specification.backFromHistory')}
            >
              {t('navigation.back')}
            </Button>
          ) : null}
        </div>
      ) : null}

      {availability === 'unavailable' && unavailableReason === 'not_implemented' ? (
        <FeatureUnavailable className="border-none" />
      ) : availability !== 'available' ? (
        <EmptyState
          icon="clock"
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
      ) : events.length === 0 ? (
        <EmptyState
          icon="clock"
          title={t('specification.activityHistoryEmptyTitle')}
          description={t('specification.activityHistoryEmptyDescription')}
          className="border-none"
        />
      ) : (
        <Timeline size="md">
          {events.map((event, index) => {
            const active = index === 0;

            switch (event.kind) {
              case 'task':
                return (
                  <TaskActivityItem
                    key={event.id}
                    event={event}
                    active={active}
                    onOpenTask={onOpenTask}
                  />
                );
              case 'session':
                return (
                  <SessionActivityItem
                    key={event.id}
                    event={event}
                    active={active}
                    onOpenSession={onOpenSession}
                  />
                );
              case 'doc':
                return (
                  <DocumentActivityItem
                    key={event.id}
                    event={event}
                    active={active}
                    onOpenDoc={onOpenDoc}
                  />
                );
              case 'info':
                return <InformationalActivityItem key={event.id} event={event} active={active} />;
              default: {
                const _exhaustive: never = event;
                void _exhaustive;
                return null;
              }
            }
          })}
        </Timeline>
      )}
    </aside>
  );
}
