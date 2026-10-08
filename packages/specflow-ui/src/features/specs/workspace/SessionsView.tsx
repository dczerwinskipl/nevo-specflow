import { Button, InformationList, Typography } from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import type { SessionSummary } from './model';
import { parseSessionMeta } from './SessionMetaLine';
import { OperationalRow } from '../shared/OperationalList';

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

      <InformationList>
        {sessions.map((session) => {
          const metaParsed =
            !session.activity && session.meta ? parseSessionMeta(session.meta) : null;
          const supporting = session.activity
            ? {
                text: session.activity.label,
                tone: session.activity.tone,
                icon: session.activity.icon,
                iconClassName: session.activity.icon === 'loader' ? 'animate-spin' : undefined,
              }
            : metaParsed
              ? {
                  text: metaParsed.status,
                  icon: metaParsed.presentation.icon,
                  iconClassName: metaParsed.presentation.iconClassName,
                  textClassName: metaParsed.presentation.textClassName,
                }
              : undefined;

          const compactFacts: [string, string] = [
            session.taskCount ?? metaParsed?.context ?? '',
            session.age ?? metaParsed?.time ?? '',
          ];

          return (
            <OperationalRow
              key={session.id}
              primary={session.title}
              onPrimaryClick={() => onOpenSession(session.id)}
              compactFacts={compactFacts}
              supporting={supporting}
            />
          );
        })}
      </InformationList>

      <Typography variant="body-sm" className="text-content-muted">
        {t('specification.sessionsFutureNotice')}
      </Typography>
    </div>
  );
}
