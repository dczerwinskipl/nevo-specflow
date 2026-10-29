import { Button, InformationList, MenuItem, OverflowMenu } from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import { sessionActivityLabel, type SessionSummary } from '../../../specs/read-model';
import { OperationalRow, type CompactFacts } from '../../../../shared/operational-list';
import { WorkspaceSection } from '../../../../shared/workspace-section';

export interface ResumeSessionSectionProps {
  readonly session: SessionSummary;
  readonly onOpenSession: (sessionId: string) => void;
  readonly onOpenSessionsView: () => void;
  readonly onStartConversation: () => void;
  readonly canStartConversation: boolean;
  readonly canOpenSession: boolean;
}

function sessionFacts({ taskCount, age }: SessionSummary): CompactFacts {
  if (taskCount && age) {
    return [taskCount, age];
  }

  if (taskCount) {
    return [taskCount];
  }

  if (age) {
    return [age];
  }

  return [];
}

export function ResumeSessionSection({
  session,
  onOpenSession,
  onOpenSessionsView,
  onStartConversation,
  canStartConversation,
  canOpenSession,
}: ResumeSessionSectionProps) {
  const { t } = useTranslation();

  return (
    <WorkspaceSection aria-labelledby="resume-heading">
      <WorkspaceSection.Header
        id="resume-heading"
        title={t('specification.continueSessionHeading')}
        icon="chat"
        actions={
          canStartConversation ? (
            <OverflowMenu
              label={t('specification.continueSessionHeading')}
              triggerLabel={t('specification.sessionActions')}
            >
              <MenuItem leadingIcon="plus" onSelect={() => onStartConversation()}>
                {t('specification.newConversation')}
              </MenuItem>
            </OverflowMenu>
          ) : undefined
        }
      />

      <InformationList>
        <OperationalRow
          titleAs="span"
          primary={session.title}
          onPrimaryClick={canOpenSession ? () => onOpenSession(session.id) : undefined}
          compactFacts={sessionFacts(session)}
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
        <Button variant="secondary" size="sm" onClick={onOpenSessionsView}>
          {t('specification.allSessionsLink')}
        </Button>
      </WorkspaceSection.Footer>
    </WorkspaceSection>
  );
}
