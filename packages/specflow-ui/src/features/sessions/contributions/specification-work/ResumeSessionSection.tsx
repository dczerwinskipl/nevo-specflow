import { Button, InformationList, MenuItem, OverflowMenu } from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import {
  sessionStatusLabel,
  sessionTaskCountLabel,
  type SessionSummary,
} from '../../../specs/read-model';
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

function sessionFacts(taskCount: string, age = ''): CompactFacts {
  if (taskCount && age) {
    return [taskCount, age];
  }

  const only = taskCount || age;

  return only ? [only] : [];
}

/**
 * Continue session: one row that opens the recent Session. The whole row is the target and shows
 * the Session name, its linked Tasks ("3 tasks", never a bare number) and a readable status.
 * "All sessions" is a quiet header action, so it never outweighs the row.
 */
export function ResumeSessionSection({
  session,
  onOpenSession,
  onOpenSessionsView,
  onStartConversation,
  canStartConversation,
  canOpenSession,
}: ResumeSessionSectionProps) {
  const { t } = useTranslation();
  const status = sessionStatusLabel(session, t);

  return (
    <WorkspaceSection aria-labelledby="resume-heading">
      <WorkspaceSection.Header
        id="resume-heading"
        title={t('specification.continueSessionHeading')}
        icon="chat"
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={onOpenSessionsView}>
              {t('specification.allSessionsLink')}
            </Button>
            {canStartConversation ? (
              <OverflowMenu
                label={t('specification.continueSessionHeading')}
                triggerLabel={t('specification.sessionActions')}
              >
                <MenuItem leadingIcon="plus" onSelect={() => onStartConversation()}>
                  {t('specification.newConversation')}
                </MenuItem>
              </OverflowMenu>
            ) : null}
          </>
        }
      />

      <InformationList>
        <OperationalRow
          titleAs="span"
          primary={session.title}
          onPrimaryClick={canOpenSession ? () => onOpenSession(session.id) : undefined}
          dataAttributes={{ 'data-focus-key': `session:${session.id}` }}
          compactFacts={sessionFacts(sessionTaskCountLabel(session, t), session.age)}
          supporting={
            session.activity && status
              ? {
                  text: status,
                  tone: session.activity.tone ?? 'neutral',
                  icon: session.activity.icon,
                  iconClassName: session.activity.animate ? 'animate-spin' : undefined,
                }
              : status
                ? { text: status }
                : session.meta
                  ? { text: session.meta }
                  : undefined
          }
        />
      </InformationList>
    </WorkspaceSection>
  );
}
