import { createContext, useContext, type ReactNode } from 'react';
import { createHttpClient, type HttpClient } from '@nevo/http-client';

import { createBrowserAuthApi, type AuthApi } from '../auth/api';
import { createAuthStore, type AuthStore } from '../auth/store';
import {
  createFixtureSpecsOverviewApi,
  createRuntimeSpecsOverviewApi,
  type SpecsOverviewApi,
} from '../features/specs/overview/api';
import type { SpecsOverviewSource } from '../features/specs/overview/model';
import { defaultSpecsSource } from '../features/specs/overview/source';
import {
  createFixtureSpecificationApi,
  createUnavailableSpecificationApi,
  type SpecificationApi,
} from '../features/specs/api';

export interface SpecFlowAppServices {
  readonly http: HttpClient;
  readonly authApi: AuthApi;
  readonly authStore: AuthStore;
  readonly specsOverviewApi: SpecsOverviewApi;
  readonly specsSource: SpecsOverviewSource;
  readonly specificationApi: SpecificationApi;
}

export type SpecFlowServices = SpecFlowAppServices;

export interface SpecFlowServicesOptions {
  readonly http?: HttpClient;
  readonly authApi?: AuthApi;
  readonly authStore?: AuthStore;
  readonly specsOverviewApi?: SpecsOverviewApi;
  readonly specsSource?: SpecsOverviewSource;
  readonly specificationApi?: SpecificationApi;
}

export function createSpecFlowAppServices(
  optionsOrClient: SpecFlowServicesOptions | HttpClient = {},
): SpecFlowAppServices {
  const options: SpecFlowServicesOptions =
    'get' in optionsOrClient && 'post' in optionsOrClient
      ? { http: optionsOrClient }
      : optionsOrClient;

  const http = options.http ?? createHttpClient();
  const authApi = options.authApi ?? createBrowserAuthApi(http);
  const authStore = options.authStore ?? createAuthStore(authApi);

  const useSampleData = import.meta.env.DEV && import.meta.env.VITE_SPECFLOW_SAMPLE_DATA === 'true';

  const specsOverviewApi =
    options.specsOverviewApi ??
    (useSampleData ? createFixtureSpecsOverviewApi() : createRuntimeSpecsOverviewApi(http));

  const specsSource = options.specsSource ?? defaultSpecsSource(specsOverviewApi);

  const specificationApi =
    options.specificationApi ??
    (useSampleData ? createFixtureSpecificationApi() : createUnavailableSpecificationApi());

  return {
    http,
    authApi,
    authStore,
    specsOverviewApi,
    specsSource,
    specificationApi,
  };
}

export const defaultSpecFlowServices: SpecFlowAppServices = createSpecFlowAppServices();

const SpecFlowServicesContext = createContext<SpecFlowServices>(defaultSpecFlowServices);

export interface SpecFlowServicesProviderProps {
  readonly services?: SpecFlowServices;
  readonly children: ReactNode;
}

export function SpecFlowServicesProvider({
  services = defaultSpecFlowServices,
  children,
}: SpecFlowServicesProviderProps) {
  return (
    <SpecFlowServicesContext.Provider value={services}>{children}</SpecFlowServicesContext.Provider>
  );
}

export function useSpecFlowServices(): SpecFlowServices {
  return useContext(SpecFlowServicesContext);
}
