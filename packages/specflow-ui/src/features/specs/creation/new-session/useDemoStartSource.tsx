import { useCallback, useMemo, useRef, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useBlocker } from '@tanstack/react-router';
import {
  chosenSessionName,
  providerDefaultEffort,
  startCatalogueFromDemo,
  useAuthOwner,
  type AgentChoice,
  type SentStart,
  type SessionNameChoice,
  type SessionStartSource,
} from '../../../sessions';
import { useRuntimeInfo } from '../../../../app/useRuntimeMode';
import { useAppServices } from '../../../../app/useAppServices';
import { useAnnouncer } from '../../../../shared/a11y/useAnnouncer';
import { useSpecificationNavigationSource } from '../../overview/useSpecificationNavigationMetadata';
import { demoCreationKeys } from '../api/api.demo';
import { CreateFailurePanel } from '../errors/CreateFailurePanel';
import {
  useCreateDemoSpecification,
  type CreateSubmission,
} from '../operation/useCreateDemoSpecification';

/**
 * The form fingerprint the Create operation compares a failure against. A failure is retired by
 * the screen when the user edits the choices (`dismissFailure`), so it is one constant here.
 */
const startSnapshot = 'session-start';

function sentStartOf(choice: AgentChoice, name: SessionNameChoice): SentStart {
  const title = chosenSessionName(name);

  return {
    providerId: choice.providerId,
    ...(choice.modelId ? { modelId: choice.modelId } : {}),
    ...(choice.effort !== providerDefaultEffort ? { effort: choice.effort } : {}),
    modeId: choice.mode,
    ...(title ? { title } : {}),
  };
}

function submissionOf(choice: AgentChoice): CreateSubmission {
  return {
    // Only the Session is allocated (`specId` is set): the specification part of the submission is
    // never sent, so it carries no values.
    title: '',
    archetype: { id: '', version: 1, optionalDocumentIds: [] },
    buildTarget: () => undefined,
    session: {
      providerId: choice.providerId,
      modelId: choice.modelId,
      ...(choice.effort !== providerDefaultEffort ? { effort: choice.effort } : {}),
      mode: choice.mode,
    },
    snapshot: startSnapshot,
  };
}

/**
 * The start source of a Specification's New Session on a demo Runtime (`/specs/$specId/sessions/new`):
 * the demo creation catalogue and the Session allocation through the shared Create operation
 * (`useCreateDemoSpecification` with `specId`), which retains the request and keeps an unknown
 * outcome checked, never blindly repeated.
 */
export function useDemoStartSource(specId: string): SessionStartSource {
  const services = useAppServices();
  const owner = useAuthOwner() ?? 'unavailable';
  const runtime = useRuntimeInfo();
  const { announce, region } = useAnnouncer();
  const catalogue = useQuery({
    queryKey: demoCreationKeys.catalogue(specId),
    queryFn: ({ signal }) => services.demoCreationApi.catalogue(specId, signal),
  });
  const specification = useSpecificationNavigationSource(specId);
  // The Session start settles through `onSession`, which resolves the promise `start` returned.
  const settle = useRef<((sessionId: string) => void) | null>(null);
  const onSession = useCallback((_specId: string, sessionId: string) => {
    settle.current?.(sessionId);
    settle.current = null;
  }, []);
  const { state, flags, actions } = useCreateDemoSpecification({
    specId,
    catalogueRevision: catalogue.data?.revision ?? '',
    snapshot: startSnapshot,
    onCreated: () => undefined,
    onSession,
    announce,
  });
  // An unfinished operation is finished by the server and resumed on return, so leaving never asks;
  // closing the tab is the one way to lose that, which the browser's own prompt covers.
  useBlocker({ shouldBlockFn: () => false, enableBeforeUnload: flags.unfinished });

  const start = useCallback(
    (choice: AgentChoice, name: SessionNameChoice) =>
      new Promise<{ sessionId: string; sent: SentStart }>((resolve, reject) => {
        // A replay (an unknown outcome checked) resends the retained request, and the form is locked
        // meanwhile, so the choices are what was sent.
        const sent = sentStartOf(choice, name);
        settle.current = (sessionId) => resolve({ sessionId, sent });
        void actions.submit(submissionOf(choice)).then((outcome) => {
          const completed =
            outcome.kind === 'completed' ||
            (outcome.kind === 'checked' && outcome.resumed?.kind === 'completed');
          if (!completed) {
            settle.current = null;
            reject(new Error('The Session was not started.'));
          }
        });
      }),
    [actions],
  );
  const refresh = useCallback(
    () => void Promise.all([runtime.refetch(), catalogue.refetch()]),
    [runtime, catalogue],
  );
  const startCatalogue = useMemo(
    () => (catalogue.data ? startCatalogueFromDemo(catalogue.data) : undefined),
    [catalogue.data],
  );
  const failure = state.failure;
  const notice: ReactNode = failure ? (
    <CreateFailurePanel
      failure={failure}
      state={state}
      workspaceOptions={undefined}
      typedTitle=""
      refreshing={false}
      announce={announce}
      onRefresh={refresh}
      // Branch-name remedies belong to Create; a Session allocation never offers them.
      onUseAutomaticName={actions.dismissFailure}
      onUseCustomName={actions.dismissFailure}
    />
  ) : undefined;
  const specificationFact: SessionStartSource['specification'] =
    specification.status === 'available'
      ? {
          status: 'ready',
          value: {
            id: specId,
            key: specification.metadata.key ?? '',
            title: specification.metadata.title,
          },
        }
      : specification.status === 'failed'
        ? { status: 'unreadable' }
        : specification.status === 'denied'
          ? { status: 'missing' }
          : { status: 'loading' };

  return {
    owner,
    catalogue: startCatalogue
      ? {
          status: 'ready',
          catalogue: startCatalogue,
          configurationUnavailable: runtime.isError || catalogue.isError,
          refresh,
        }
      : catalogue.isPending
        ? { status: 'loading' }
        : { status: 'error', refresh },
    specification: specificationFact,
    start,
    dismissFailure: actions.dismissFailure,
    ...(flags.recovery
      ? { pending: { kind: 'recover' as const, checking: state.checking } }
      : flags.uncertain
        ? { pending: { kind: 'check' as const, checking: state.checking } }
        : {}),
    notice,
    extras: region,
  };
}
