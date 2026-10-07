import { createHttpClient, type HttpClient } from '@nevo/http-client';

import { createBrowserAuthApi } from '../auth/api';
import { createAuthStore, type AuthStore } from '../auth/store';
import type { SpecsOverviewSource } from '../features/specs/overview/model';
import { defaultSpecsSource } from '../features/specs/overview/source';

export interface SpecFlowAppServices {
  readonly auth: AuthStore;
  readonly specs: SpecsOverviewSource;
}

export function createSpecFlowAppServices(
  client: HttpClient = createHttpClient(),
): SpecFlowAppServices {
  return {
    auth: createAuthStore(createBrowserAuthApi(client)),
    specs: defaultSpecsSource(client),
  };
}
