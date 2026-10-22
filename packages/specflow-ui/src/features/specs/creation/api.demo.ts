import type { HttpRequestClient } from '@nevo/http-client';
import type {
  DemoCatalogue,
  DemoCreateOptions,
  DemoCreateRequest,
  DemoCreatedSpec,
  DemoOperationStatus,
} from '@nevo/specflow-contracts/demo';

/**
 * Time-box of the atomic create. When it elapses the request may already have been committed, so
 * the UI treats it as an uncertain outcome (same operation id, check only), never as a failure.
 */
export const createRequestTimeoutMs = 15_000;

/** Port of the demo Runtime's Specification creation (Session allocation belongs to the Sessions port). */
export interface DemoCreationApi {
  catalogue(specId?: string, signal?: AbortSignal): Promise<DemoCatalogue>;
  createOptions(signal?: AbortSignal): Promise<DemoCreateOptions>;
  create(input: DemoCreateRequest): Promise<DemoCreatedSpec>;
  operationStatus(operationId: string, signal?: AbortSignal): Promise<DemoOperationStatus>;
}

export const demoCreationKeys = {
  catalogue: (specId?: string) => ['demo-creation-catalogue', specId ?? null] as const,
  createOptions: ['demo-create-options'] as const,
};

/** Demo-runtime adapter of {@link DemoCreationApi}. */
export function createDemoCreationApi(http: HttpRequestClient): DemoCreationApi {
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
