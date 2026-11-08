import { createElement, useCallback, useMemo, useReducer } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateSession,
  ProviderDescriptor,
  SessionAssociationRead,
} from '@nevo/specflow-contracts/sessions';
import type { ManagedSessionsApi } from '../../managed/api';
import type { SessionAssociationsApi } from '../../associations/api';
import { invalidateSpecificationSessions } from '../../associations/queries';
import { createSessionRequest } from '../../managed/creation/request';
import type { ContextFact, ContextSpecification } from '../../managed/context/sessionContextTypes';
import { startCatalogueFromProviders } from '../catalogue/fromProviderDescriptors';
import { providerDefaultEffort, type AgentChoice } from '../choice/agentChoice';
import { chosenSessionName, type SessionNameChoice } from '../choice/sessionName';
import type { SentStart } from '../handoff/startedSession';
import { UnreadableSavedStart } from '../form/UnreadableSavedStart';
import type { SessionStartSource } from './sessionStartSource';

function browserSessionStorage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.sessionStorage;
  } catch {
    return undefined;
  }
}

/**
 * What the managed Runtime's create (`POST /api/specs/:specId/sessions`) is sent for a start: the
 * provider, the optional model and effort, the chosen work mode (a provider's own mode carries its
 * engine safety mode and its id) and the own name when there is one.
 */
export function createSessionBody(
  provider: ProviderDescriptor | undefined,
  choice: AgentChoice,
  name: SessionNameChoice,
): Omit<CreateSession, 'requestId'> {
  const native = provider?.providerModes?.find((mode) => mode.modeId === choice.mode);
  const title = chosenSessionName(name);

  return {
    providerId: choice.providerId,
    ...(choice.modelId ? { modelId: choice.modelId } : {}),
    ...(choice.effort !== providerDefaultEffort ? { effort: choice.effort } : {}),
    mode: native?.mode ?? (choice.mode === 'workspace-write' ? 'workspace-write' : 'read-only'),
    ...(native ? { providerModeId: native.modeId } : {}),
    ...(title ? { title } : {}),
  };
}

/** What a create body carried, for the handoff to the Session it opens. */
export function sentStartOf(body: Omit<CreateSession, 'requestId'>): SentStart {
  return {
    providerId: body.providerId,
    ...(body.modelId ? { modelId: body.modelId } : {}),
    ...(body.effort ? { effort: body.effort } : {}),
    modeId: body.providerModeId ?? body.mode,
    ...(body.title ? { title: body.title } : {}),
  };
}

/** The Specification a project-mode New Session starts in. */
export interface ManagedStartSpecification {
  specId: string;
  /** Its identity as Context shows it (the pinned Specification). */
  fact: ContextFact<ContextSpecification>;
}

/**
 * The association a Session started in a Specification has, from the composed create's answer and
 * the pinned Specification: what the association read returns for it until anything changes. Only
 * a Specification Context already shows can stand in for the read; otherwise the read alone tells.
 */
export function startedAssociation(
  sessionId: string,
  association: { specId: string; taskIds: string[] },
  specification: ContextFact<ContextSpecification>,
): SessionAssociationRead | undefined {
  if (specification.status !== 'ready' || association.taskIds.length > 0) {
    return undefined;
  }

  const { key, title, collection } = specification.value;

  return {
    sessionId,
    association: {
      kind: 'specification',
      specification: {
        state: 'available',
        value: {
          specId: association.specId,
          ...(key ? { key } : {}),
          title,
          collection: collection ?? 'current',
        },
      },
      tasks: [],
    },
  };
}

/**
 * The start source of a Specification's New Session in a project Runtime
 * (`/specs/$specId/sessions/new`): the provider catalogue (`GET /api/session-providers`) and the
 * composed create `POST /api/specs/:specId/sessions` with request retention. The request is
 * persisted before it is sent and kept until it is acknowledged, so a lost response is retried as
 * the same request — also after a reload, and even when the provider has meanwhile become
 * unavailable (`pending`).
 */
export function useManagedStartSource(
  owner: string,
  api: ManagedSessionsApi,
  associations: SessionAssociationsApi,
  specification: ManagedStartSpecification,
): SessionStartSource {
  const { specId, fact } = specification;
  const queryClient = useQueryClient();
  const retained = useMemo(
    () => createSessionRequest(owner, browserSessionStorage(), specId),
    [owner, specId],
  );
  // `retained` keeps its pending request outside React: a send settling re-reads it.
  const [, reread] = useReducer((count: number) => count + 1, 0);
  const providers = useQuery({
    queryKey: ['managed-session-providers', owner],
    queryFn: ({ signal }) => api.providers(signal),
  });
  const items = providers.data?.items;
  const catalogue = useMemo(
    () => (items ? startCatalogueFromProviders(items) : undefined),
    [items],
  );
  const refresh = useCallback(() => void providers.refetch(), [providers]);
  const discard = useCallback(() => {
    retained.discard();
    reread();
  }, [retained]);

  const start = useCallback(
    async (choice: AgentChoice, name: SessionNameChoice) => {
      const kept = retained.pending();
      // A retained request is resent verbatim: the choices made since do not change what was sent.
      const body = kept
        ? (({ requestId: _requestId, ...rest }) => rest)(kept)
        : createSessionBody(
            items?.find((item) => item.providerId === choice.providerId),
            choice,
            name,
          );
      try {
        const created = await retained.send(body, (request) =>
          associations.createInSpecification(specId, request),
        );
        const association = startedAssociation(created.sessionId, created.association, fact);
        // Refresh-on-action: the workspace `revision` does not cover Sessions.
        void invalidateSpecificationSessions(queryClient, created.association.specId);

        return {
          sessionId: created.sessionId,
          sent: sentStartOf(body),
          ...(association ? { association } : {}),
        };
      } finally {
        reread();
      }
    },
    [associations, items, retained, specId, fact, queryClient],
  );

  // An unreadable retained request is never dropped silently: the user discards it explicitly.
  const unreadable =
    retained.state() === 'unreadable'
      ? createElement(UnreadableSavedStart, { onDiscard: discard })
      : null;

  return {
    owner,
    specification: fact,
    catalogue: catalogue
      ? {
          status: 'ready',
          catalogue,
          configurationUnavailable: providers.isError,
          refresh,
        }
      : providers.isPending
        ? { status: 'loading' }
        : { status: 'error', refresh },
    start,
    // In the form when there is one, else beside the error that stands in for it.
    ...(unreadable ? (catalogue ? { notice: unreadable } : { extras: unreadable }) : {}),
    ...(retained.pending() ? { pending: { kind: 'retry' as const, checking: false } } : {}),
  };
}
