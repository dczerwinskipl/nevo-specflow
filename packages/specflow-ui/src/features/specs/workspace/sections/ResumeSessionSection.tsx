import { Button, InformationList } from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import { OperationalRow } from '../../shared/OperationalList';
import type { SessionSummary } from '../model';
import { useWorkspaceRuntime } from '../WorkspaceContext';
import { WorkspaceSection } from './WorkspaceSection';

export interface ResumeSessionSectionProps {
  readonly session: SessionSummary;
}

export function ResumeSessionSection({ session }: ResumeSessionSectionProps) {
  const { t } = useTranslation();
  const runtime = useWorkspaceRuntime();

  const isSessionOpenable = runtime.canOpenSession !== false;

  return (
    <WorkspaceSection aria-labelledby="resume-heading">
      <WorkspaceSection.Header
        id="resume-heading"
        title={t('specification.continueSessionHeading')}
        icon="chat"
        actions={
          <Button
            size="sm"
            variant="secondary"
            disabled={!runtime.canStartConversation}
            title={!runtime.canStartConversation ? t('common.notImplemented') : undefined}
            onClick={() => runtime.startConversation()}
          >
            {t('specification.newConversation')}
          </Button>
        }
      />

      <InformationList>
        <OperationalRow
          titleAs="h4"
          primary={session.title}
          onPrimaryClick={isSessionOpenable ? () => runtime.openSession(session.id) : undefined}
          compactFacts={[session.taskCount ?? '', session.age ?? '']}
          supporting={
            session.activity
              ? {
                  text: session.activity.label,
                  tone: session.activity.tone ?? 'neutral',
                  icon: session.activity.icon,
                  iconClassName: session.activity.animate ? 'animate-spin' : undefined,
                }
              : session.meta
                ? { text: session.meta }
                : undefined
          }
        />
      </InformationList>

      <WorkspaceSection.Footer>
        <button
          type="button"
          onClick={runtime.openSessionsView}
          className="font-medium text-accent-primary hover:underline focus-visible:outline-2 focus-visible:outline-focus-ring"
        >
          {t('specification.allSessionsLink')}
        </button>
      </WorkspaceSection.Footer>
    </WorkspaceSection>
  );
}
