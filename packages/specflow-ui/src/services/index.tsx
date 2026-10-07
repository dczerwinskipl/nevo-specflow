import { createContext, useContext, type ReactNode } from 'react';
import { createHttpClient, type HttpClient } from '@nevo/http-client';

import { createBrowserAuthApi, type AuthApi } from '../auth/api';
import { createAuthStore, type AuthStore } from '../auth/store';
import {
  createFixtureSpecsOverviewApi,
  createRuntimeSpecsOverviewApi,
  type SpecsOverviewApi,
} from '../features/specs/overview/api';
import {
  createFixtureSpecificationApi,
  createRuntimeSpecificationApi,
  type SpecificationApi,
} from '../features/specs/api';

export interface SpecFlowServices {
  readonly http: HttpClient;
  readonly authApi: AuthApi;
  readonly authStore: AuthStore;
  readonly specsOverviewApi: SpecsOverviewApi;
  readonly specificationApi: SpecificationApi;
}

export interface SpecFlowServicesOptions {
  readonly http?: HttpClient;
  readonly authApi?: AuthApi;
  readonly authStore?: AuthStore;
  readonly specsOverviewApi?: SpecsOverviewApi;
  readonly specificationApi?: SpecificationApi;
}

export function createSpecFlowServices(options: SpecFlowServicesOptions = {}): SpecFlowServices {
  const http = options.http ?? createHttpClient();
  const authApi = options.authApi ?? createBrowserAuthApi(http);
  const authStore = options.authStore ?? createAuthStore(authApi);

  const useSampleData = import.meta.env.DEV && import.meta.env.VITE_SPECFLOW_SAMPLE_DATA === 'true';

  const specsOverviewApi =
    options.specsOverviewApi ??
    (useSampleData ? createFixtureSpecsOverviewApi() : createRuntimeSpecsOverviewApi(http));

  const specificationApi =
    options.specificationApi ??
    (useSampleData ? createFixtureSpecificationApi() : createRuntimeSpecificationApi(http));

  return {
    http,
    authApi,
    authStore,
    specsOverviewApi,
    specificationApi,
  };
}

export const defaultSpecFlowServices: SpecFlowServices = createSpecFlowServices();

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
