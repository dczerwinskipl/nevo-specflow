import { contributeTo, type UiModule } from '../../app/ui-modules/contracts';
import {
  specificationAttentionItems,
  specificationWorkSections,
  type SpecificationWorkSectionContext,
} from '../specs';
import { ResumeSessionSection } from './contributions/specification-work/ResumeSessionSection';
import { sessionsDisabled } from './navigation/summary';
import { startSessionOffered } from './associations/startSessionGate';

function SpecificationResumeSession({ data, actions }: SpecificationWorkSectionContext) {
  if (!data.resumeSession) {
    return null;
  }

  return (
    <ResumeSessionSection
      session={data.resumeSession}
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
      slot: 'context',
      isVisible: ({ data }) => !data.isEmpty && Boolean(data.resumeSession),
      Component: SpecificationResumeSession,
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

        return source.items.map((item) => ({
          item,
          icon: 'chat',
          action: item.targetId
            ? {
                label: item.actionLabel,
                labelKey:
                  item.actionCode === 'session' ? 'specification.openSessionAction' : undefined,
                onClick: () => actions.openSession(item.targetId!),
                disabled: actions.canOpenSession === false,
                disabledTitleKey:
                  actions.canOpenSession === false ? 'common.notImplemented' : undefined,
              }
            : undefined,
        }));
      },
    }),
  ],
};
