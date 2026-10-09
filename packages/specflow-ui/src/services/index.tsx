import { createContext, useContext, type ReactNode } from 'react';
import { createHttpClient, type HttpClient } from '@nevo/http-client';

import { createBrowserAuthApi, type AuthApi } from '../auth/api';
import { createRuntimeInfoApi, type RuntimeInfoApi } from './runtimeInfoApi';
import { createAuthStore, type AuthStore } from '../auth/store';
import {
  createRuntimeSpecsOverviewApi,
  type SpecsOverviewApi,
} from '../features/specs/overview/api';
import { createRuntimeSpecificationApi, type SpecificationApi } from '../features/specs/api';

export interface SpecFlowAppServices {
  readonly runtimeInfoApi: RuntimeInfoApi;
  readonly authApi: AuthApi;
  readonly authStore: AuthStore;
  readonly specsOverviewApi: SpecsOverviewApi;
  readonly specificationApi: SpecificationApi;
}

export type SpecFlowServices = SpecFlowAppServices;

export interface SpecFlowServicesOptions {
  readonly http?: HttpClient;
  readonly runtimeInfoApi?: RuntimeInfoApi;
  readonly authApi?: AuthApi;
  readonly authStore?: AuthStore;
  readonly specsOverviewApi?: SpecsOverviewApi;
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

  const specsOverviewApi = options.specsOverviewApi ?? createRuntimeSpecsOverviewApi(http);

  const specificationApi = options.specificationApi ?? createRuntimeSpecificationApi(http);

  return {
    runtimeInfoApi: options.runtimeInfoApi ?? createRuntimeInfoApi(http),
    authApi,
    authStore,
    specsOverviewApi,
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
