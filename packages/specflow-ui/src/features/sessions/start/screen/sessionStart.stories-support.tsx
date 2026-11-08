import { useId, useMemo, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { AppShell, AppWorkspaceProvider } from '@nevo/ui';
import type {
  StartTurn,
  CreateSession,
  ProviderDescriptor,
  SessionSnapshot,
} from '@nevo/specflow-contracts/sessions';
import type { ManagedSessionsApi } from '../../managed/api';
import { ManagedSession } from '../../managed/ManagedSession';
import { fixtureApi, sessionFixture } from '../../managed/managedSession.stories-support';
import type {
  ContextSpecification,
  SessionContextViewModel,
} from '../../managed/context/sessionContextTypes';
import type { SessionAssociationsApi } from '../../associations/api';
import { associationContext } from '../../associations/associationContext';
import { sessionAssociationKeys } from '../../associations/queries';
import type { SessionAssociationRead } from '@nevo/specflow-contracts/sessions';
import {
  forgetStartedSessions,
  rememberStartedSession,
  startedSessionOf,
  type StartedSession,
} from '../handoff/startedSession';
import { managedProviders } from '../catalogue/providerDescriptors.stories-support';
import { providerDescriptor } from '../catalogue/startCatalogue.stories-support';
import { useManagedStartSource } from '../source/useManagedStartSource';
import { SessionStartScreen, type SessionStartDefaults } from './SessionStartScreen';

export const storySessionId = '00000000-0000-4000-8000-0000000000a1';
export const storySpecification: ContextSpecification = {
  id: 'api-integration',
  key: 'SPEC-1',
  title: 'Logowanie SSO',
};

/** The shell every Session screen is composed in: the application shell and the workspace around it. */
export function StartEnvironment({
  children,
  browserHistory = false,
}: {
  children: ReactNode;
  browserHistory?: boolean;
}) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } }),
  );

  return (
    <QueryClientProvider client={client}>
      <div style={{ width: '100%', height: '100vh' }}>
        <AppShell navigation={<div>Projekt</div>} style={{ height: '100%', width: '100%' }}>
          <AppWorkspaceProvider browserHistory={browserHistory}>{children}</AppWorkspaceProvider>
        </AppShell>
      </div>
    </QueryClientProvider>
  );
}

/** The Specification a managed start preview starts in (`/specs/$specId/sessions/new`). */
const storyPinned = {
  specId: storySpecification.id,
  fact: { status: 'ready', value: storySpecification },
} as const;

/** What the managed Runtime was asked to create (reset by every start preview). */
export const creates: CreateSession[] = [];

/**
 * The Session screen the Runtime opens at once: the Session exists, its first snapshot is empty (no
 * message yet) or still loading. It is rendered as the route does: what the Session was started
 * with is handed to it, and its Context is its association (the one its start seeded, else
 * `context`, else standalone).
 */
/** The messages the opened Session sent to the Runtime (reset by every start preview). */
export const turns: StartTurn[] = [];

export function StartedSessionView({
  started,
  owner = 'story',
  sessionId = storySessionId,
  snapshot = 'empty',
  context,
  onOpenSpecification,
}: {
  started: StartedSession;
  context?: SessionContextViewModel;
  owner?: string;
  sessionId?: string;
  /**
   * `loading`: the first snapshot never arrives, so only the start values are shown; `failed`: it
   * cannot be read.
   */
  snapshot?: 'empty' | 'loading' | 'failed';
  onOpenSpecification?: (specification: ContextSpecification) => void;
}) {
  const queryClient = useQueryClient();
  const [{ api, sessionContext }] = useState(() => {
    rememberStartedSession(owner, sessionId, started);
    const seeded = queryClient.getQueryData<SessionAssociationRead>(
      sessionAssociationKeys.read(sessionId),
    );
    const base = sessionFixture();
    const created = creates.at(-1);
    const empty: SessionSnapshot = {
      ...base,
      session: {
        ...base.session,
        sessionId,
        providerId: started.providerId,
        title: started.title,
        readiness: 'ready',
        ...(started.modelId ? { modelId: started.modelId } : {}),
        ...(started.effort ? { effort: started.effort } : {}),
        ...(started.modeId ? { providerModeId: started.modeId } : {}),
        ...(created ? { mode: created.mode } : {}),
      },
      entries: [],
      history: { hasOlder: false },
    };
    // The Runtime's catalogue knows the provider the Session was started with, its model and its mode.
    const provider = providerDescriptor({
      providerId: started.providerId,
      title: started.providerTitle,
      models: started.modelId
        ? [
            {
              modelId: started.modelId,
              title: started.modelTitle ?? started.modelId,
              efforts: started.effort ? [started.effort] : [],
            },
          ]
        : [],
      modes: ['read-only', 'workspace-write'],
      ...(started.modeId
        ? {
            defaultModeId: started.modeId,
            providerModes: [
              {
                modeId: started.modeId,
                title: started.modeTitle ?? started.modeId,
                nativeMode: started.modeId,
                mode: 'workspace-write' as const,
                readiness: 'ready' as const,
                authorized: true,
              },
            ],
          }
        : {}),
    });
    const api: ManagedSessionsApi = {
      ...fixtureApi(empty),
      providers: () => Promise.resolve({ items: [provider] }),
      snapshot: () =>
        snapshot === 'loading'
          ? new Promise(() => undefined)
          : snapshot === 'failed'
            ? Promise.reject(new Error('Session unavailable'))
            : Promise.resolve(empty),
      start: (_id, input) => {
        turns.push(structuredClone(input));

        return Promise.resolve({ turnId: 'turn-1' });
      },
    };

    return {
      api,
      sessionContext:
        context ??
        (seeded
          ? associationContext({ status: 'success', data: seeded })
          : { scope: { kind: 'standalone' as const } }),
    };
  });

  return (
    <ManagedSession
      sessionId={sessionId}
      owner={owner}
      api={api}
      sessionContext={sessionContext}
      onOpenSpecification={onOpenSpecification}
    />
  );
}

/** A Session already started here, as it is shown while (or after) its first snapshot loads. */
export function StartedSessionPreview(props: {
  started: StartedSession;
  snapshot?: 'empty' | 'loading' | 'failed';
  context?: SessionContextViewModel;
}) {
  return (
    <StartEnvironment browserHistory>
      <StartedSessionView {...props} onOpenSpecification={() => undefined} />
    </StartEnvironment>
  );
}

function managedApi(providers: ProviderDescriptor[]): ManagedSessionsApi {
  return {
    providers: () => Promise.resolve({ items: providers }),
  } as unknown as ManagedSessionsApi;
}

function associationsApi(outcome: 'ok' | 'failed' | 'never'): SessionAssociationsApi {
  return {
    createInSpecification: (specId: string, input: CreateSession) => {
      creates.push(structuredClone(input));

      return outcome === 'ok'
        ? Promise.resolve({ sessionId: storySessionId, association: { specId, taskIds: [] } })
        : outcome === 'failed'
          ? Promise.reject(new Error('Session creation failed'))
          : new Promise(() => undefined);
    },
  } as unknown as SessionAssociationsApi;
}

/**
 * A Specification's New Session on the managed Runtime (`/specs/$specId/sessions/new`) with its
 * real start source over a faked transport. A created Session opens as in the route
 * (`onOpenSession` replaces the screen with the Session screen), so the whole flow can be walked.
 */
export function ManagedStartPreview({
  providers = managedProviders,
  outcome = 'ok',
  defaults,
}: {
  providers?: ProviderDescriptor[];
  outcome?: 'ok' | 'failed' | 'never';
  defaults?: SessionStartDefaults;
}) {
  // A fresh identity per mount: a request retained by an earlier story must not be resent here.
  const owner = `story-${useId()}`;
  const [opened, setOpened] = useState<string>();
  useState(() => {
    creates.length = 0;
    turns.length = 0;
    forgetStartedSessions();
  });

  return opened ? (
    <StartEnvironment browserHistory>
      <StartedSessionView
        owner={owner}
        sessionId={opened}
        started={
          startedSessionOf(owner, opened) ?? {
            providerId: 'claude',
            providerIcon: 'claude',
            providerTitle: 'Claude',
          }
        }
        onOpenSpecification={() => undefined}
      />
    </StartEnvironment>
  ) : (
    <StartEnvironment>
      <ManagedStartScreen
        owner={owner}
        providers={providers}
        outcome={outcome}
        defaults={defaults}
        onOpenSession={setOpened}
      />
    </StartEnvironment>
  );
}

function ManagedStartScreen({
  owner,
  providers,
  outcome,
  defaults,
  onOpenSession,
}: {
  owner: string;
  providers: ProviderDescriptor[];
  outcome: 'ok' | 'failed' | 'never';
  defaults?: SessionStartDefaults;
  onOpenSession: (sessionId: string) => void;
}) {
  const api = useMemo(() => managedApi(providers), [providers]);
  const associations = useMemo(() => associationsApi(outcome), [outcome]);
  const source = useManagedStartSource(owner, api, associations, storyPinned);

  return (
    <SessionStartScreen
      source={source}
      defaults={defaults}
      onOpenSession={onOpenSession}
      onOpenSpecification={() => undefined}
    />
  );
}
