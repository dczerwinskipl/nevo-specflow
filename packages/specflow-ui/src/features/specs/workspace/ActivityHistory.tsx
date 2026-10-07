import { Button, Icon, Typography } from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import type { ActivityEvent } from './model';

export interface ActivityHistoryProps {
  readonly events: readonly ActivityEvent[];
  readonly isExplicit?: boolean;
  readonly onClose?: () => void;
  readonly onOpenTask?: (taskId: string) => void;
  readonly onOpenSession?: (sessionId: string) => void;
  readonly onOpenDoc?: (docId: string) => void;
}

export function ActivityHistory({
  events,
  isExplicit = false,
  onClose,
  onOpenTask,
  onOpenSession,
  onOpenDoc,
}: ActivityHistoryProps) {
  const { t } = useTranslation();

  return (
    <aside
      className="flex h-full flex-col overflow-y-auto p-5"
      aria-label={t('specification.historyAriaLabel')}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <Typography
            as="h2"
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

      <ol className="relative m-0 list-none border-l border-border-subtle pl-4">
        {events.map((event) => {
          const hasAction = Boolean(event.type && event.targetId);

          const handleTargetClick = () => {
            if (event.type === 'task' && event.targetId) {
              onOpenTask?.(event.targetId);
            } else if (event.type === 'session' && event.targetId) {
              onOpenSession?.(event.targetId);
            } else if (event.type === 'doc' && event.targetId) {
              onOpenDoc?.(event.targetId);
            }
          };

          return (
            <li key={event.id} className="relative pb-5 pl-3">
              <span
                aria-hidden="true"
                className="absolute -left-[1.3125rem] top-1.5 size-2 rounded-full bg-border-strong"
              />
              <div className="text-body-xs text-content-muted">{event.time}</div>
              <div className="mt-0.5 font-medium text-content-primary">
                {hasAction ? (
                  <button
                    type="button"
                    onClick={handleTargetClick}
                    className="text-left text-content-primary hover:text-accent-primary hover:underline focus-visible:outline-2 focus-visible:outline-focus-ring [overflow-wrap:anywhere]"
                    aria-label={
                      event.type === 'task'
                        ? t('specification.previewTaskAria', { title: event.title })
                        : event.type === 'session'
                          ? t('specification.openSessionAria', { title: event.title })
                          : t('specification.readDocAria', { title: event.title })
                    }
                  >
                    {event.title}
                  </button>
                ) : (
                  <span className="[overflow-wrap:anywhere]">{event.title}</span>
                )}
              </div>
              <p className="mt-1 text-body-xs text-content-muted">{event.description}</p>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
