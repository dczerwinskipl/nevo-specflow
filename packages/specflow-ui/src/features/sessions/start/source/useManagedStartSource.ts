import { useCallback, useMemo, useReducer } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { CreateSession, ProviderDescriptor } from '@nevo/specflow-contracts/sessions';
import type { ManagedSessionsApi } from '../../managed/api';
import { createSessionRequest } from '../../managed/creation/request';
import { startCatalogueFromProviders } from '../catalogue/fromProviderDescriptors';
import { providerDefaultEffort, type AgentChoice } from '../choice/agentChoice';
import { chosenSessionName, type SessionNameChoice } from '../choice/sessionName';
import type { SentStart } from '../handoff/startedSession';
import type { SessionStartSource } from './sessionStartSource';

function browserSessionStorage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.sessionStorage;
  } catch {
    return undefined;
  }
}

/**
 * What the managed Runtime's `POST /api/sessions` is sent for a start: the provider, the optional
 * model and effort, the chosen work mode (a provider's own mode carries its engine safety mode and
 * its id) and the own name when there is one.
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

/**
 * The start source of the managed Runtime (`/sessions/new`): its provider catalogue
 * (`GET /api/session-providers`) and `POST /api/sessions` with request retention. The request is
 * persisted before it is sent and kept until it is acknowledged, so a lost response is retried as
 * the same request — also after a reload, and even when the provider has meanwhile become
 * unavailable (`pending`).
 */
export function useManagedStartSource(owner: string, api: ManagedSessionsApi): SessionStartSource {
  const retained = useMemo(() => createSessionRequest(owner, browserSessionStorage()), [owner]);
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
        const created = await retained.send(body, (request) => api.create(request));

        return { sessionId: created.sessionId, sent: sentStartOf(body) };
      } finally {
        reread();
      }
    },
    [api, items, retained],
  );

  return {
    owner,
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
    ...(retained.pending() ? { pending: { kind: 'retry' as const, checking: false } } : {}),
  };
}
