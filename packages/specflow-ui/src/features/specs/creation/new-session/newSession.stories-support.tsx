import { useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppShell, AppWorkspaceProvider } from '@nevo/ui';
import type { DemoCatalogue, DemoSessionInput } from '@nevo/specflow-contracts/demo';
import { createWorkspaceIntegrationApi } from '../../../../../test-support/specs/workspace/api';
import { TestServicesRouterContext } from '../../../../../test-support/app/TestServicesRouterContext';
import { VisitStateProvider } from '../../../../app/VisitStateProvider';
import { createSpecFlowAppServices } from '../../../../services';
import { SessionLandingPreview } from '../../../sessions/managed/naming/sessionLanding.stories-support';
import { CreateSpecificationScreen } from '../CreateSpecificationScreen';
import { catalogue as creationCatalogue } from '../options/creationCatalogue.stories-support';
import type { SessionStart } from './sessionStart';

export const newSessionSpecId = 'api-integration';
/** The Session allocations the screen sent (reset by every fixture mount). */
export const allocations: DemoSessionInput[] = [];
/** What the opened Session was given at start (reset by every fixture mount). */
export const starts: SessionStart[] = [];

/** The generated name the mocked agent gives a Session it names from the first message. */
export const generatedSessionTitle = 'Luki w kryteriach logowania SSO';

/**
 * The New Session screen of `/specs/$specId/sessions/new` on a demo Runtime, with mocked
 * catalogue, Specification and Session allocation. Starting a Session shows the Session screen
 * stand-in (`SessionLandingPreview`): idle with the provisional title and an empty Composer; the
 * agent names it only after the first message sent there.
 */
export function NewSessionFixture({
  catalogue = creationCatalogue,
  allocation = 'ok',
}: {
  catalogue?: DemoCatalogue;
  allocation?: 'ok' | 'failed';
}) {
  useState(() => {
    allocations.length = 0;
    starts.length = 0;
  });
  const [started, setStarted] = useState<SessionStart | null>(null);
  const client = useMemo(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } }),
    [],
  );
  const services = useMemo(() => {
    const defaults = createSpecFlowAppServices();
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
        ...defaults.demoCreationApi,
        catalogue: () => Promise.resolve(catalogue),
      },
      sessionsApi: {
        ...defaults.sessionsApi,
        allocate: (_specId, input) => {
          allocations.push(structuredClone(input));

          return allocation === 'ok'
            ? Promise.resolve({ sessionId: 'session-new', location: catalogue.currentLocation })
            : Promise.reject(new Error('Session allocation failed'));
        },
      },
    });
  }, [allocation, catalogue]);

  return (
    <QueryClientProvider client={client}>
      <TestServicesRouterContext services={services}>
        <VisitStateProvider>
          <div style={{ width: '100%', height: '100vh' }}>
            <AppWorkspaceProvider>
              <AppShell navigation={<div>Projekt</div>} style={{ height: '100%', width: '100%' }}>
                {started ? (
                  <SessionLandingPreview
                    customName={started.name}
                    generatedTitle={generatedSessionTitle}
                  />
                ) : (
                  <CreateSpecificationScreen
                    specId={newSessionSpecId}
                    onCreated={() => undefined}
                    onSession={(_spec, _session, start) => {
                      if (start) {
                        starts.push(start);
                        setStarted(start);
                      }
                    }}
                    onBack={() => undefined}
                  />
                )}
              </AppShell>
            </AppWorkspaceProvider>
          </div>
        </VisitStateProvider>
      </TestServicesRouterContext>
    </QueryClientProvider>
  );
}
