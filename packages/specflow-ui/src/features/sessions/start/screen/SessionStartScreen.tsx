import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AppWorkspace,
  WorkspaceHeader,
  useRegisterPinnedSecondaryTab,
  useSecondaryNavigation,
  useWorkspaceCapabilities,
  type WorkspaceHeaderAction,
} from '@nevo/ui';
import { useWorkspaceLabels } from '../../../../app/navigation/useWorkspaceLabels';
import { useMessage } from '../../../../i18n/message';
import { SessionContext, createSessionContextStack } from '../../managed/context/SessionContext';
import type { ContextSpecification } from '../../managed/context/sessionContextTypes';
import { initialAgentChoice, type AgentChoice } from '../choice/agentChoice';
import { initialSessionName, type SessionNameChoice } from '../choice/sessionName';
import type { SessionStartStatus } from '../form/SessionStartForm';
import { rememberStartedSession, startedSessionFrom } from '../handoff/startedSession';
import type { SessionStartSource } from '../source/sessionStartSource';
import { SessionStartColumn } from './SessionStartColumn';
import { readyCatalogue, startContextValue } from './startContext';

/** Nothing below it is chosen: what the form holds until a catalogue offers an agent. */
const noAgent: AgentChoice = {
  providerId: '',
  modelId: '',
  effort: 'provider-default',
  mode: '',
};

/** The Context's own id while the Session does not exist yet. */
const pendingSessionId = 'new-session';

/**
 * Starting a new Session inside the Session screen itself
 * (`docs/ideas/specflow-ui/screens/new-session-ui-spec.md`): the full Session shell at once — the
 * header (**New session**, the side-panel toggle or Context), Context with the pinned
 * Specification and the executor mirroring the choice, the start form in the conversation column
 * and the Composer inactive until Start. The screen presents and collects; the `source` owns the
 * catalogue and the request. When the Session exists, what it was started with is remembered for
 * the Session screen and `onOpenSession` opens it in place of this screen.
 */
/** What the form begins with; the screen owns the values from then on (restoring a form, stories). */
export interface SessionStartDefaults {
  agent?: AgentChoice;
  name?: SessionNameChoice;
  status?: SessionStartStatus;
}

export function SessionStartScreen({
  source,
  defaults,
  onOpenSession,
  onOpenSpecification,
}: {
  source: SessionStartSource;
  defaults?: SessionStartDefaults;
  /** The Session was created: replace this screen with it. */
  onOpenSession: (sessionId: string) => void;
  /** Opens the pinned Specification from Context. */
  onOpenSpecification?: (specification: ContextSpecification) => void;
}) {
  const { t } = useTranslation();
  const text = useMessage();
  const { supportsSplit } = useWorkspaceCapabilities();
  const navigation = useSecondaryNavigation();
  const labels = useWorkspaceLabels();
  const [contextOpen, setContextOpen] = useState(true);
  const [chosen, setChosen] = useState<AgentChoice | undefined>(defaults?.agent);
  const [name, setName] = useState<SessionNameChoice>(defaults?.name ?? initialSessionName);
  const [status, setStatus] = useState<SessionStartStatus>(defaults?.status ?? 'idle');
  useRegisterPinnedSecondaryTab(
    supportsSplit && contextOpen ? { title: t('sessions.context.title') } : null,
  );
  // A result arriving after this screen is gone must not open a Session for whoever is here now.
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
    };
  }, []);

  // The failure is about the choices that were submitted: editing them retires it.
  const edited = () => {
    setStatus('idle');
    source.dismissFailure?.();
  };

  const catalogue = readyCatalogue(source.catalogue);
  const agent = chosen ?? (catalogue ? initialAgentChoice(catalogue) : noAgent);

  const start = () => {
    // What is submitted is what the Session is opened with, however the form changes meanwhile.
    const submitted = { agent, name };
    setStatus('starting');
    source.start(submitted.agent, submitted.name).then(
      ({ sessionId }) => {
        if (!mounted.current) {
          return;
        }

        const started =
          catalogue &&
          startedSessionFrom({
            catalogue,
            choice: submitted.agent,
            name: submitted.name,
            specification: source.specification,
            modeTitle: text,
          });
        if (started) {
          rememberStartedSession(sessionId, started);
        }

        onOpenSession(sessionId);
      },
      () => {
        if (mounted.current) {
          setStatus('failed');
        }
      },
    );
  };

  const notChosen = t('sessionStart.executor.notChosen');
  const contextValue = useMemo(
    () =>
      startContextValue({
        catalogue: source.catalogue,
        choice: agent,
        specification: source.specification,
        notChosen,
      }),
    [source.catalogue, agent, source.specification, notChosen],
  );

  const contextAction: WorkspaceHeaderAction = !supportsSplit
    ? {
        id: 'context',
        label: t('sessions.context.title'),
        icon: 'file',
        direct: 'always',
        onPress: () =>
          void navigation.open(
            createSessionContextStack(pendingSessionId, contextValue, onOpenSpecification),
            {},
          ),
      }
    : {
        id: 'context',
        label: t('managedSession.sidePanel'),
        icon: 'panel-right',
        presentation: 'icon',
        pressed: contextOpen,
        direct: 'always',
        onPress: () => setContextOpen((open) => !open),
      };

  return (
    <AppWorkspace scroll="workspace" fit="available" split="dynamic" labels={labels}>
      <AppWorkspace.Primary
        header={
          <WorkspaceHeader
            title={t('sessionStart.heading')}
            // The Session's own actions (rename, archive, delete) exist only after Start.
            actions={[contextAction]}
            labels={{ moreActions: t('common.moreActions') }}
          />
        }
      >
        <SessionStartColumn
          source={source}
          agent={agent}
          onAgentChange={(next) => {
            setChosen(next);
            edited();
          }}
          name={name}
          onNameChange={(next) => {
            setName(next);
            edited();
          }}
          status={status}
          onStart={start}
        />
      </AppWorkspace.Primary>
      <AppWorkspace.Secondary
        open={contextOpen}
        onOpenChange={setContextOpen}
        header={<WorkspaceHeader title={t('sessions.context.title')} />}
      >
        <SessionContext
          sessionId={pendingSessionId}
          value={contextValue}
          onOpenSpecification={onOpenSpecification}
        />
      </AppWorkspace.Secondary>
    </AppWorkspace>
  );
}
