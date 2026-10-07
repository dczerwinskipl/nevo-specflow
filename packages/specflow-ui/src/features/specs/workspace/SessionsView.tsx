import { Button, cn, fastColorTransitionClassName, Typography } from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import type { SessionSummary } from './model';
import { SessionMetaLine } from './SessionMetaLine';
import { scanGrid } from '../overview/geometry';

export interface SessionsViewProps {
  readonly sessions: readonly SessionSummary[];
  readonly onOpenSession: (id: string) => void;
  readonly onNewConversation: () => void;
}

export function SessionsView({ sessions, onOpenSession, onNewConversation }: SessionsViewProps) {
  const { t } = useTranslation();

  return (
    <div className="grid max-w-content-standard gap-6 py-2">
      <div className="flex items-center justify-between gap-4">
        <Typography as="h1" variant="title-md" className="font-semibold text-content-primary">
          {t('specification.sessionsOfThisSpec')}
        </Typography>

        <Button leadingIcon="chat-plus" onClick={onNewConversation}>
          {t('specification.newConversation')}
        </Button>
      </div>

      <ul className="divide-y divide-border-subtle">
        {sessions.map((session) => (
          <li
            key={session.id}
            className={cn(
              '@container/session-row group relative min-h-14 min-w-0 rounded-control py-2 hover:bg-surface-hover',
              fastColorTransitionClassName,
            )}
          >
            <div className={cn(scanGrid, 'w-full max-w-content-standard items-center')}>
              <span aria-hidden="true" />
              <span aria-hidden="true" />
              <div className="pointer-events-none flex min-w-0 flex-1 flex-col gap-x-4 gap-y-1 pr-2 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <Typography
                    as="h3"
                    variant="title-sm"
                    className="min-w-0 text-content-primary [overflow-wrap:anywhere]"
                  >
                    <button
                      type="button"
                      onClick={() => onOpenSession(session.id)}
                      className="pointer-events-auto block w-full text-left hover:text-accent-primary focus-visible:outline-2 focus-visible:outline-focus-ring"
                    >
                      {session.title}
                    </button>
                  </Typography>
                  <Typography as="div" variant="body-sm" className="mt-0.5">
                    <SessionMetaLine meta={session.meta} />
                  </Typography>
                </div>
                <div className="pointer-events-auto shrink-0 self-start sm:self-center">
                  <Button variant="secondary" size="sm" onClick={() => onOpenSession(session.id)}>
                    {t('common.open')}
                  </Button>
                </div>
              </div>
              <span aria-hidden="true" />
            </div>
          </li>
        ))}
      </ul>

      <Typography variant="body-sm" className="text-content-muted">
        {t('specification.sessionsFutureNotice')}
      </Typography>
    </div>
  );
}
