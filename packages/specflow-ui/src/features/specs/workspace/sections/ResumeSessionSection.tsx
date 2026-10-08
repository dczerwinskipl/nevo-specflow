import { Icon, InformationList, Typography } from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import { OperationalRow } from '../../shared/OperationalList';
import type { SessionSummary } from '../model';
import { useWorkspaceRuntime } from '../WorkspaceContext';

export interface ResumeSessionSectionProps {
  readonly session: SessionSummary;
}

export function ResumeSessionSection({ session }: ResumeSessionSectionProps) {
  const { t } = useTranslation();
  const runtime = useWorkspaceRuntime();

  return (
    <section aria-labelledby="resume-heading" className="grid gap-2">
      <div className="flex items-center gap-2">
        <span className="flex size-4 shrink-0 items-center justify-center text-content-muted">
          <Icon name="chat" size="sm" />
        </span>
        <Typography
          as="h2"
          variant="title-sm"
          id="resume-heading"
          className="font-semibold text-content-primary"
        >
          {t('specification.continueSessionHeading')}
        </Typography>
      </div>

      <InformationList>
        <OperationalRow
          primary={session.title}
          onPrimaryClick={() => runtime.openSession(session.id)}
          compactFacts={[session.taskCount ?? '', session.age ?? '']}
          supporting={
            session.activity
              ? {
                  text: session.activity.label,
                  tone: session.activity.tone,
                  icon: session.activity.icon,
                  iconClassName: session.activity.icon === 'loader' ? 'animate-spin' : undefined,
                }
              : session.meta
                ? { text: session.meta }
                : undefined
          }
        />
      </InformationList>

      <div className="flex flex-wrap items-center gap-4 border-t border-border-subtle pt-2 text-body-xs">
        <button
          type="button"
          onClick={runtime.openSessionsView}
          className="font-medium text-accent-primary hover:underline focus-visible:outline-2 focus-visible:outline-focus-ring"
        >
          {t('specification.allSessionsLink')}
        </button>
        <button
          type="button"
          onClick={() => runtime.startConversation()}
          className="font-medium text-accent-primary hover:underline focus-visible:outline-2 focus-visible:outline-focus-ring"
        >
          {t('specification.newConversation')}
        </button>
        <button
          type="button"
          onClick={runtime.openHistory}
          className="font-medium text-accent-primary hover:underline focus-visible:outline-2 focus-visible:outline-focus-ring lg:hidden"
        >
          {t('specification.activityHistoryLink')}
        </button>
      </div>
    </section>
  );
}
