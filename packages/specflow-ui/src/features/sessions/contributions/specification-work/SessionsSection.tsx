import { Button, EmptyState, InformationList } from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { sessionActivityLabel, type SessionSummary } from '../../../specs/read-model';
import { OperationalRow, type SemanticSupporting } from '../../../../shared/operational-list';
import { useNow } from '../../../../shared/operations/panel/relativeTime';
import { WorkspaceSection } from '../../../../shared/workspace-section';
import { SessionProviderIcon } from '../../shared/SessionProviderIcon';
import { sessionTitleOf } from '../../shared/agentStepTitle';
import {
  sessionRowFacts,
  sessionRowStatus,
  type SessionRowAgent,
  type SessionRowReadiness,
} from '../../shared/sessionRow';
import { productIcons } from '../../../../shared/product-icons';

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
 * When the start is offered, New session is always visible as the Tasks section's quiet add action
 * (a ghost "+" button): under the rows, or beside the empty text without Sessions.
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
  // The same quiet add action as the Tasks section's New task.
  const newSession = canStartSession ? (
    <Button variant="ghost" size="sm" leadingIcon="plus" onClick={() => onStartSession()}>
      {t('sessions.list.newSession')}
    </Button>
  ) : null;
  if (sessions.length === 0) {
    return (
      <WorkspaceSection aria-labelledby="resume-heading">
        <WorkspaceSection.Header
          id="resume-heading"
          headingTag="h2"
          title={t('specification.sessionsHeading')}
          icon={productIcons.session.collection}
        />
        <EmptyState
          variant="inline"
          title={
            <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span>{t('sessions.list.emptySpecification')}</span>
              {newSession}
            </span>
          }
        />
      </WorkspaceSection>
    );
  }

  return (
    <WorkspaceSection aria-labelledby="resume-heading">
      <WorkspaceSection.Header
        id="resume-heading"
        headingTag="h2"
        title={t('specification.sessionsHeading')}
        icon={productIcons.session.collection}
        actions={
          <Button variant="ghost" size="sm" onClick={onOpenSessionsView}>
            {t('specification.allSessionsLink')}
          </Button>
        }
      />

      <InformationList>
        {sessions.map((session) => (
          <OperationalRow
            key={session.id}
            titleAs="span"
            leading={<SessionProviderIcon providerId={session.providerId} />}
            // An agent step Session by its step (and Task); a title the owner gave it wins.
            primary={sessionTitleOf(session.title, session.agentStep) ?? session.title}
            onPrimaryClick={canOpenSession ? () => onOpenSession(session.id) : undefined}
            dataAttributes={{ 'data-focus-key': `session:${session.id}` }}
            // The same row as the Session's row in the Specification Sessions list.
            factsLayout="inline"
            compactFacts={sessionRowFacts(
              {
                ...(session.agentStep ? { attempt: session.agentStep.attempt } : {}),
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
      {newSession ? <div className="px-2">{newSession}</div> : null}
    </WorkspaceSection>
  );
}
