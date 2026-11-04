import { useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppShell, AppWorkspaceProvider } from '@nevo/ui';
import { HttpClientError } from '@nevo/http-client';
import type { DemoCatalogue, DemoSessionInput } from '@nevo/specflow-contracts/demo';
import { createWorkspaceIntegrationApi } from '../../../../../test-support/specs/workspace/api';
import { TestServicesRouterContext } from '../../../../../test-support/app/TestServicesRouterContext';
import { VisitStateProvider } from '../../../../app/VisitStateProvider';
import { createSpecFlowAppServices } from '../../../../services';
import {
  forgetStartedSessions,
  startedSessionOf,
  type StartedSession,
} from '../../../sessions/start/handoff/startedSession';
import {
  SessionStartScreen,
  type SessionStartDefaults,
} from '../../../sessions/start/screen/SessionStartScreen';
import {
  StartedSessionPreview,
  StartedSessionView,
  storySessionId,
} from '../../../sessions/start/screen/sessionStart.stories-support';
import { startCatalogue } from './demoStartCatalogue.stories-support';
import { useDemoStartSource } from './useDemoStartSource';

export const startSpecId = 'api-integration';
/** The Session allocations the screen sent (reset by every preview mount). */
export const allocations: DemoSessionInput[] = [];

/**
 * A Specification's New Session on a demo Runtime: the real demo start source (the shared Create
 * operation) over a mocked catalogue, Specification and Session allocation. A started Session opens
 * as in the route, replacing the start screen with the Session screen.
 */
export function DemoStartPreview({
  catalogue = startCatalogue,
  allocation = 'ok',
  defaults,
}: {
  catalogue?: DemoCatalogue;
  /**
   * `failed`: the Runtime refuses (a definite failure); `unknown`: the answer is lost (the outcome
   * is unknown and is checked, never repeated blindly); `never`: no answer yet.
   */
  allocation?: 'ok' | 'failed' | 'unknown' | 'never';
  defaults?: SessionStartDefaults;
}) {
  useState(() => {
    allocations.length = 0;
    forgetStartedSessions();
  });
  const [opened, setOpened] = useState<string>();
  const client = useMemo(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } }),
    [],
  );
  const services = useMemo(() => {
    const defaultServices = createSpecFlowAppServices();
    const workspace = createWorkspaceIntegrationApi();

    return createSpecFlowAppServices({
      runtimeInfoApi: { getInfo: () => Promise.resolve({ dataMode: 'demo' }) },
      specificationApi: {
        getSpecificationWorkspace: async (specId, signal) => {
          const dto = await workspace.getSpecificationWorkspace(specId, signal);

          return { ...dto, specification: { ...dto.specification, title: 'Logowanie SSO' } };
        },
      },
      demoCreationApi: {
        ...defaultServices.demoCreationApi,
        catalogue: () => Promise.resolve(catalogue),
      },
      sessionsApi: {
        ...defaultServices.sessionsApi,
        allocate: (_specId, input) => {
          allocations.push(structuredClone(input));

          return allocation === 'ok'
            ? Promise.resolve({ sessionId: storySessionId, location: catalogue.currentLocation })
            : allocation === 'failed'
              ? Promise.reject(
                  new HttpClientError('Session allocation failed', {
                    kind: 'http',
                    status: 500,
                    data: { error: 'demo_session_allocation_failed' },
                  }),
                )
              : allocation === 'unknown'
                ? Promise.reject(new Error('Connection lost'))
                : new Promise(() => undefined);
        },
      },
    });
  }, [allocation, catalogue]);

  return (
    <QueryClientProvider client={client}>
      <TestServicesRouterContext services={services}>
        <VisitStateProvider>
          <div style={{ width: '100%', height: '100vh' }}>
            <AppShell navigation={<div>Projekt</div>} style={{ height: '100%', width: '100%' }}>
              <AppWorkspaceProvider browserHistory={opened !== undefined}>
                {opened ? (
                  <StartedSessionView
                    sessionId={opened}
                    started={startedSessionOf(opened) ?? fallbackStarted}
                    onOpenSpecification={() => undefined}
                  />
                ) : (
                  <DemoStartScreen
                    defaults={defaults}
                    onOpenSession={(sessionId) => setOpened(sessionId)}
                  />
                )}
              </AppWorkspaceProvider>
            </AppShell>
          </div>
        </VisitStateProvider>
      </TestServicesRouterContext>
    </QueryClientProvider>
  );
}

const fallbackStarted: StartedSession = {
  providerId: 'codex',
  providerIcon: 'codex',
  providerTitle: 'Codex',
};

function DemoStartScreen({
  defaults,
  onOpenSession,
}: {
  defaults?: SessionStartDefaults;
  onOpenSession: (sessionId: string) => void;
}) {
  const source = useDemoStartSource(startSpecId);

  return (
    <SessionStartScreen
      source={source}
      defaults={defaults}
      onOpenSession={onOpenSession}
      onOpenSpecification={() => undefined}
    />
  );
}

/**
 * A Session of the Specification already started here, as the Session screen shows it while its
 * first snapshot loads or once it is empty. (The Specification is the one the start screen pinned.)
 */
export function DemoStartedPreview({
  snapshot = 'empty',
  ...started
}: StartedSession & { snapshot?: 'empty' | 'loading' }) {
  return (
    <StartedSessionPreview
      snapshot={snapshot}
      started={{
        ...started,
        specification: {
          status: 'ready',
          value: { id: startSpecId, key: 'SPEC-1', title: 'Logowanie SSO' },
        },
      }}
    />
  );
}
