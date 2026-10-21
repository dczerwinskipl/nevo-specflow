import type { HttpRequestClient } from '@nevo/http-client';
import type {
  DemoCatalogue,
  DemoCreateOptions,
  DemoCreatedSpec,
  DemoOperationStatus,
} from '@nevo/specflow-contracts/demo';
import { createRequestTimeoutMs, type CreationApi } from './api';

/** Demo-runtime adapter of {@link CreationApi}; a real adapter can sit beside it. */
export function createDemoCreationApi(http: HttpRequestClient): CreationApi {
  return {
    catalogue: (specId, signal) =>
      http.get<DemoCatalogue>(
        `/api/demo/specification-creation${specId ? `?specId=${encodeURIComponent(specId)}` : ''}`,
        { signal },
      ),
    createOptions: (signal) =>
      http.get<DemoCreateOptions>('/api/demo/specs/create-options', { signal }),
    create: (input) =>
      http.post<DemoCreatedSpec>('/api/demo/specifications', input, {
        timeoutMs: createRequestTimeoutMs,
      }),
    operationStatus: (operationId, signal) =>
      http.get<DemoOperationStatus>(
        `/api/demo/specifications/operations/${encodeURIComponent(operationId)}`,
        { signal },
      ),
  };
}
