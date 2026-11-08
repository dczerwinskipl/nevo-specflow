import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useBlocker } from '@tanstack/react-router';
import {
  chosenSessionName,
  invalidateSpecificationSessions,
  providerDefaultEffort,
  startCatalogueFromDemo,
  startedAssociation,
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
import { useSpecificationWorkspace } from '../../read-model';
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

/** One `start()` call's way back to its caller. */
interface StartCall {
  resolve: (sessionId: string) => void;
}

type PinnedSpecification = NonNullable<SessionStartSource['specification']>;

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
 * outcome checked, never blindly repeated. The Session is started at the workspace's
 * `startSession.path` (the demo Runtime has no composed create).
 */
export function useDemoStartSource(
  specId: string,
  /** The Specification's collection the start was opened from: an archived one seeds `archive`. */
  collection: 'current' | 'archive' = 'current',
): SessionStartSource {
  const services = useAppServices();
  const owner = useAuthOwner() ?? 'unavailable';
  const runtime = useRuntimeInfo();
  const { announce, region } = useAnnouncer();
  const catalogue = useQuery({
    queryKey: demoCreationKeys.catalogue(specId),
    queryFn: ({ signal }) => services.demoCreationApi.catalogue(specId, signal),
  });
  const specification = useSpecificationNavigationSource(specId);
  const sessionPath = useSpecificationWorkspace(specId).data?.startSession?.path;
  const queryClient = useQueryClient();
  // The Session start settles through `onSession`, which resolves the promise `start` returned.
  // `current` is the one start in flight: each call owns its own resolvers and only ever clears
  // itself, so a late settlement of an earlier call cannot drop a later one.
  const current = useRef<StartCall | null>(null);
  const onSession = useCallback((_specId: string, sessionId: string) => {
    const call = current.current;
    current.current = null;
    call?.resolve(sessionId);
  }, []);
  const { state, flags, actions } = useCreateDemoSpecification({
    specId,
    ...(sessionPath ? { sessionPath } : {}),
    catalogueRevision: catalogue.data?.revision ?? '',
    snapshot: startSnapshot,
    onCreated: () => undefined,
    onSession,
    announce,
  });
  // Leaving never asks: the operation is retained in this page's memory and offered for checking or
  // recovery on return within it. Closing or reloading the tab is the one way to lose it (a demo
  // allocation is not persisted), which the browser's own prompt covers.
  useBlocker({ shouldBlockFn: () => false, enableBeforeUnload: flags.unfinished });

  const status = specification.status;
  const title = specification.metadata?.title;
  const key = specification.metadata?.key;
  const specificationFact = useMemo<PinnedSpecification>(
    () =>
      status === 'available' && title !== undefined
        ? {
            status: 'ready',
            value: {
              id: specId,
              key: key ?? '',
              title,
              collection: collection === 'archive' ? 'archived' : 'current',
            },
          }
        : status === 'failed'
          ? { status: 'unreadable' }
          : status === 'denied'
            ? { status: 'missing' }
            : { status: 'loading' },
    [status, title, key, specId, collection],
  );
  // What the start resolves with: the Specification pinned when the allocation settles.
  const pinned = useRef(specificationFact);
  useEffect(() => {
    pinned.current = specificationFact;
  }, [specificationFact]);

  const start = useCallback(
    (choice: AgentChoice, name: SessionNameChoice) =>
      new Promise<{ sessionId: string; sent: SentStart }>((resolve, reject) => {
        if (current.current) {
          // One start at a time: refuse this one and leave the running one's resolver intact.
          reject(new Error('A Session is already being started.'));

          return;
        }

        // A replay (an unknown outcome checked) resends the retained request, and the form is locked
        // meanwhile, so the choices are what was sent.
        const sent = sentStartOf(choice, name);
        const call: StartCall = {
          resolve: (sessionId) => {
            void invalidateSpecificationSessions(queryClient, specId);
            const association = startedAssociation(
              sessionId,
              { specId, taskIds: [] },
              pinned.current,
            );
            resolve({ sessionId, sent, ...(association ? { association } : {}) });
          },
        };
        current.current = call;
        const fail = (error: Error) => {
          if (current.current === call) {
            current.current = null;
          }

          reject(error);
        };

        void actions.submit(submissionOf(choice)).then(
          (outcome) => {
            const completed =
              outcome.kind === 'completed' ||
              (outcome.kind === 'checked' && outcome.resumed?.kind === 'completed');
            if (!completed) {
              fail(new Error('The Session was not started.'));
            }
          },
          (error: unknown) =>
            fail(error instanceof Error ? error : new Error('The Session was not started.')),
        );
      }),
    [actions, queryClient, specId],
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
