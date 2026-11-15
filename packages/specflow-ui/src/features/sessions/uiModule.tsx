import { contributeTo, type UiModule } from '../../app/ui-modules/contracts';
import { message } from '../../i18n/message';
import {
  specificationAttentionItems,
  specificationWorkSections,
  type SpecificationWorkSectionContext,
} from '../specs';
import type { SessionSummary, SpecificationWorkspaceData } from '../specs/read-model';
import { SessionsSection } from './contributions/specification-work/SessionsSection';
import { SessionProviderIcon } from './shared/SessionProviderIcon';
import { sessionsDisabled } from './navigation/summary';
import { startSessionOffered } from './associations/startSessionGate';

/** Sessions the Overview lists (UX contract: at most three). */
const OVERVIEW_SESSIONS = 3;

/**
 * The Overview's Sessions: the recommended Session first, then the other Sessions of the read, at
 * most three. A Session waiting for the person is in Requires attention instead, never twice.
 */
export function overviewSessions(data: SpecificationWorkspaceData): readonly SessionSummary[] {
  const attention = data.featureAttention?.sessions;
  const inAttention = new Set(
    attention?.state === 'available' ? attention.items.map((item) => item.targetId) : [],
  );
  const recommended = data.resumeSession;
  const ordered = [
    ...(recommended ? [recommended] : []),
    ...data.sessions.filter((session) => session.id !== recommended?.id),
  ];

  return ordered.filter((session) => !inAttention.has(session.id)).slice(0, OVERVIEW_SESSIONS);
}

function SpecificationSessions({ data, actions }: SpecificationWorkSectionContext) {
  const sessions = overviewSessions(data);
  if (sessions.length === 0) {
    return null;
  }

  return (
    <SessionsSection
      sessions={sessions}
      onOpenSession={actions.openSession}
      onOpenSessionsView={actions.openSessionsView}
      onStartSession={actions.openNewSession}
      canStartSession={startSessionOffered(data.startSession)}
      canOpenSession={actions.canOpenSession !== false}
    />
  );
}

export const sessionsUiModule: UiModule = {
  id: 'specflow.sessions',
  contributions: [
    contributeTo(specificationWorkSections, {
      id: 'specflow.sessions.resume',
      slot: 'resume',
      // Independent of Tasks: the Specification's Sessions whenever one is not in attention.
      isVisible: ({ data }) => overviewSessions(data).length > 0,
      Component: SpecificationSessions,
    }),
    contributeTo(specificationAttentionItems, {
      id: 'specflow.sessions.attention',
      getItems: ({ data, actions }) => {
        const source = data.featureAttention?.sessions;
        // Turned-off Sessions have nothing to attend to; it is not a failed read.
        if (sessionsDisabled(data)) {
          return { state: 'excluded' };
        }

        if (!source || (source.state === 'unavailable' && source.reason === 'source_unavailable')) {
          return { state: 'unavailable' };
        }

        if (source.state !== 'available') {
          return { state: 'excluded' };
        }

        return source.items.map((item) => {
          const session = data.sessions.find((candidate) => candidate.id === item.targetId);

          return {
            item,
            icon: 'chat',
            ...(session?.providerId
              ? { leading: <SessionProviderIcon providerId={session.providerId} /> }
              : {}),
            facts: [
              message('specification.attentionSession'),
              ...(session?.providerTitle ? [session.providerTitle] : []),
            ],
            reasonIcon: 'chat',
            action: item.targetId
              ? {
                  label: message(
                    item.action === 'answer-session'
                      ? 'specification.answerSessionAction'
                      : 'specification.openSessionAction',
                  ),
                  onClick: () => actions.openSession(item.targetId!),
                  disabled: actions.canOpenSession === false,
                  ...(actions.canOpenSession === false
                    ? { disabledTitleKey: 'common.notImplemented' as const }
                    : {}),
                }
              : undefined,
          };
        });
      },
    }),
  ],
};
