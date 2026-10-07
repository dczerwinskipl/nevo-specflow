import { Button, Typography } from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import type { SessionSummary } from './model';

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

      <div className="divide-y divide-border-subtle">
        {sessions.map((session) => (
          <div key={session.id} className="flex items-center justify-between gap-4 py-4">
            <div className="min-w-0">
              <div className="font-medium text-content-primary [overflow-wrap:anywhere]">
                {session.title}
              </div>
              <div className="text-body-xs text-content-muted">{session.meta}</div>
            </div>

            <Button variant="secondary" size="sm" onClick={() => onOpenSession(session.id)}>
              {t('common.open')}
            </Button>
          </div>
        ))}
      </div>

      <Typography variant="body-sm" className="text-content-muted">
        {t('specification.sessionsFutureNotice')}
      </Typography>
    </div>
  );
}
