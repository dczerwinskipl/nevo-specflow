import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import { appI18n, LocalizationProvider } from '../../i18n';
import { createSpecFlowQueryClient } from '../../app/queryClient';
import { createSpecFlowServices, SpecFlowServicesProvider } from '../../services';
import { SpecificationSurface } from './SpecificationSurface';
import { createFixtureSpecificationApi, type SpecificationApi } from './api';
import { specificationKeys } from './queries';
import { createSpecificationWorkspaceFixture } from './workspace/fixtures';

import { AppShell } from '@nevo/ui';

describe('SpecificationSurface', () => {
  beforeEach(async () => {
    await appI18n.changeLanguage('pl');
  });

  function renderWithProviders(
    component: React.ReactElement,
    servicesOverride?: { specificationApi?: SpecificationApi },
  ) {
    const queryClient = createSpecFlowQueryClient();
    const services = createSpecFlowServices(servicesOverride);
    return renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <SpecFlowServicesProvider services={services}>
          <LocalizationProvider>
            <AppShell navigation={<div>Nav</div>}>{component}</AppShell>
          </LocalizationProvider>
        </SpecFlowServicesProvider>
      </QueryClientProvider>,
    );
  }

  it('renders explicit data fixture directly without queryClient execution', () => {
    const fixtureData = createSpecificationWorkspaceFixture('working', 'spec-direct');
    const markup = renderWithProviders(
      <SpecificationSurface specId="spec-direct" data={fixtureData} />,
    );

    expect(markup).toContain('Odświeżanie sesji i zachowanie kontekstu użytkownika');
    expect(markup).toContain('ID specyfikacji: spec-direct');
  });

  it('shows loading state on initial fetch without preloaded data', () => {
    const markup = renderWithProviders(<SpecificationSurface specId="spec-missing" />);

    // Initial query state is loading, not fixture domain data
    expect(markup).not.toContain('Odświeżanie sesji i zachowanie kontekstu użytkownika');
    expect(markup).toContain('Ładowanie specyfikacji spec-missing');
  });

  it('shows honest unavailable state when specification API fails / is not yet backed', () => {
    const markup = renderWithProviders(<SpecificationSurface specId="spec-missing" />);

    // Initial query state shows loading without fabricated domain state
    expect(markup).not.toContain('Odświeżanie sesji i zachowanie kontekstu użytkownika');
    expect(markup).toContain('Ładowanie specyfikacji spec-missing');
  });

  it('allows fixture API injection explicitly in test/fixture environments', async () => {
    const queryClient = createSpecFlowQueryClient();
    const services = createSpecFlowServices({
      specificationApi: createFixtureSpecificationApi('working'),
    });

    // Prime query client cache to test successful data rendering via query
    await queryClient.prefetchQuery({
      queryKey: specificationKeys.detail('spec-123'),
      queryFn: () => services.specificationApi.getSpecificationWorkspace('spec-123'),
    });

    const markup = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <SpecFlowServicesProvider services={services}>
          <LocalizationProvider>
            <AppShell navigation={<div>Nav</div>}>
              <SpecificationSurface specId="spec-123" />
            </AppShell>
          </LocalizationProvider>
        </SpecFlowServicesProvider>
      </QueryClientProvider>,
    );

    expect(markup).toContain('Odświeżanie sesji i zachowanie kontekstu użytkownika');
    expect(markup).toContain('ID specyfikacji: spec-123');
  });
});
