import { Button, InformationList, MenuItem, OverflowMenu } from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { sessionActivityLabel, type SessionSummary } from '../../../specs/read-model';
import { OperationalRow, type SemanticSupporting } from '../../../../shared/operational-list';
import { useNow } from '../../../../shared/operations/panel/relativeTime';
import { WorkspaceSection } from '../../../../shared/workspace-section';
import { SessionProviderIcon } from '../../shared/SessionProviderIcon';
import {
  sessionRowFacts,
  sessionRowStatus,
  type SessionRowAgent,
  type SessionRowReadiness,
} from '../../shared/sessionRow';

export interface SessionsSectionProps {
  /** The Sessions to show, the recommended one first. */
  readonly sessions: readonly SessionSummary[];
  readonly onOpenSession: (sessionId: string) => void;
  readonly onOpenSessionsView: () => void;
  /** Opens the Specification's New Session (`/specs/$specId/sessions/new`). */
  readonly onStartSession: () => void;
  /** The workspace's `startSession` offers the start (full-session.md "Starting a Session"). */
  readonly canStartSession: boolean;
  readonly canOpenSession: boolean;
}

/** The workspace section's status, as the effective readiness it projects. */
const readinessOf: Record<NonNullable<SessionSummary['navigationStatus']>, SessionRowReadiness> = {
  active: 'busy',
  attention: 'requiresAttention',
  quiet: 'ready',
  authenticationRequired: 'authenticationRequired',
  unknown: 'unavailable',
};

/** The agent of a workspace row; a summary without a provider names none. */
function agentOf(session: SessionSummary): SessionRowAgent | undefined {
  return session.providerId
    ? {
        providerId: session.providerId,
        ...(session.providerTitle ? { providerTitle: session.providerTitle } : {}),
        ...(session.modelId ? { modelId: session.modelId } : {}),
        ...(session.modelTitle ? { modelTitle: session.modelTitle } : {}),
      }
    : undefined;
}

/**
 * The status of the Session's row in the list, from the workspace row's effective readiness; a
 * summary without one keeps its activity label.
 */
function sessionStatus(session: SessionSummary, t: TFunction): SemanticSupporting | undefined {
  const agent = agentOf(session);
  if (session.navigationStatus && agent) {
    return sessionRowStatus(readinessOf[session.navigationStatus], agent, t);
  }

  if (session.activity) {
    return {
      text: sessionActivityLabel(session, t),
      tone: session.activity.tone ?? 'neutral',
      icon: session.activity.icon,
      iconClassName: session.activity.animate ? 'animate-spin' : undefined,
    };
  }

  return session.meta ? { text: session.meta } : undefined;
}

/**
 * Sessions on the Overview: the recommended Session first, then other Sessions of the
 * Specification, each the same row as in the Specification Sessions list (age, agent, Tasks and
 * its effective status). "All sessions" is a quiet header action, so it never outweighs the rows.
 */
export function SessionsSection({
  sessions,
  onOpenSession,
  onOpenSessionsView,
  onStartSession,
  canStartSession,
  canOpenSession,
}: SessionsSectionProps) {
  const { t, i18n } = useTranslation();
  const now = useNow();

  return (
    <WorkspaceSection aria-labelledby="resume-heading">
      <WorkspaceSection.Header
        id="resume-heading"
        title={t('specification.sessionsHeading')}
        icon="chat"
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={onOpenSessionsView}>
              {t('specification.allSessionsLink')}
            </Button>
            {canStartSession ? (
              <OverflowMenu
                label={t('specification.sessionsHeading')}
                triggerLabel={t('specification.sessionActions')}
              >
                <MenuItem leadingIcon="plus" onSelect={() => onStartSession()}>
                  {t('sessions.list.newSession')}
                </MenuItem>
              </OverflowMenu>
            ) : null}
          </>
        }
      />

      <InformationList>
        {sessions.map((session) => (
          <OperationalRow
            key={session.id}
            titleAs="span"
            leading={<SessionProviderIcon providerId={session.providerId} />}
            primary={session.title}
            onPrimaryClick={canOpenSession ? () => onOpenSession(session.id) : undefined}
            dataAttributes={{ 'data-focus-key': `session:${session.id}` }}
            // The same row as the Session's row in the Specification Sessions list.
            factsLayout="inline"
            compactFacts={sessionRowFacts(
              {
                ...(session.updatedAt ? { updatedAt: session.updatedAt } : {}),
                agent: agentOf(session),
                taskCount: session.taskCount ?? 0,
              },
              t,
              now,
              i18n.language,
            )}
            supporting={sessionStatus(session, t)}
          />
        ))}
      </InformationList>
    </WorkspaceSection>
  );
}
