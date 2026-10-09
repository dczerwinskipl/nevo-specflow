import { InformationList, MenuItem, OverflowMenu } from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import { OperationalRow } from '../../shared/OperationalList';
import type { SessionSummary } from '../model';
import { sessionActivityLabel } from '../status-labels';
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
          <OverflowMenu
            label={t('specification.continueSessionHeading')}
            triggerLabel={t('specification.sessionActions')}
            disabled={!runtime.canStartConversation}
            title={!runtime.canStartConversation ? t('common.notImplemented') : undefined}
          >
            <MenuItem
              leadingIcon="plus"
              disabled={!runtime.canStartConversation}
              onSelect={() => runtime.startConversation()}
            >
              {t('specification.newConversation')}
            </MenuItem>
          </OverflowMenu>
        }
      />

      <InformationList>
        <OperationalRow
          titleAs="span"
          primary={session.title}
          onPrimaryClick={isSessionOpenable ? () => runtime.openSession(session.id) : undefined}
          compactFacts={[session.taskCount ?? '', session.age ?? '']}
          supporting={
            session.activity
              ? {
                  text: sessionActivityLabel(session, t),
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
        <WorkspaceSection.Continuation onClick={runtime.openSessionsView}>
          {t('specification.allSessionsLink')}
        </WorkspaceSection.Continuation>
      </WorkspaceSection.Footer>
    </WorkspaceSection>
  );
}
