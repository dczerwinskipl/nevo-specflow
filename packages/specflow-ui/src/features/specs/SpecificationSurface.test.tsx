import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import { appI18n, LocalizationProvider } from '../../i18n';
import { createSpecFlowQueryClient } from '../../app/queryClient';
import { createSpecFlowAppServices, SpecFlowServicesProvider } from '../../services';
import { SpecificationSurface } from './SpecificationSurface';
import {
  createFixtureSpecificationApi,
  SpecificationWorkspaceUnavailableError,
  type SpecificationApi,
} from './api';
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
    const services = createSpecFlowAppServices(servicesOverride);
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

  it('shows honest unavailable state when specification API fails / capability is missing', () => {
    const queryClient = createSpecFlowQueryClient();
    const services = createSpecFlowAppServices();
    const query = queryClient.getQueryCache().build(queryClient, {
      queryKey: specificationKeys.detail('spec-missing'),
    });
    query.setState({
      status: 'error',
      error: new SpecificationWorkspaceUnavailableError('spec-missing'),
      fetchStatus: 'idle',
      errorUpdateCount: 1,
    });

    const markup = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <SpecFlowServicesProvider services={services}>
          <LocalizationProvider>
            <AppShell navigation={<div>Nav</div>}>
              <SpecificationSurface specId="spec-missing" />
            </AppShell>
          </LocalizationProvider>
        </SpecFlowServicesProvider>
      </QueryClientProvider>,
    );

    // Shows honest unavailable state, not false 404 "not found"
    expect(markup).toContain('Specyfikacja jest niedostępna');
    expect(markup).not.toContain('Nie znaleziono specyfikacji');
  });

  it('renders genuine not found only when API returns 404 domain error', () => {
    const queryClient = createSpecFlowQueryClient();
    const domainNotFoundError = new Error('Not found');
    (domainNotFoundError as unknown as Record<string, unknown>).status = 404;

    const services = createSpecFlowAppServices();
    const query = queryClient.getQueryCache().build(queryClient, {
      queryKey: specificationKeys.detail('spec-404'),
    });
    query.setState({
      status: 'error',
      error: domainNotFoundError,
      fetchStatus: 'idle',
      errorUpdateCount: 1,
    });

    const markup = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <SpecFlowServicesProvider services={services}>
          <LocalizationProvider>
            <AppShell navigation={<div>Nav</div>}>
              <SpecificationSurface specId="spec-404" />
            </AppShell>
          </LocalizationProvider>
        </SpecFlowServicesProvider>
      </QueryClientProvider>,
    );

    expect(markup).toContain('Nie znaleziono specyfikacji');
  });

  it('allows fixture API injection explicitly in test/fixture environments', async () => {
    const queryClient = createSpecFlowQueryClient();
    const services = createSpecFlowAppServices({
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
