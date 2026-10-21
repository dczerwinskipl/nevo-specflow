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

/** Port of Specification creation (Session allocation belongs to the Sessions port). */
export interface CreationApi {
  catalogue(specId?: string, signal?: AbortSignal): Promise<DemoCatalogue>;
  createOptions(signal?: AbortSignal): Promise<DemoCreateOptions>;
  create(input: DemoCreateRequest): Promise<DemoCreatedSpec>;
  operationStatus(operationId: string, signal?: AbortSignal): Promise<DemoOperationStatus>;
}

export const creationKeys = {
  catalogue: (specId?: string) => ['demo-creation-catalogue', specId ?? null] as const,
  createOptions: ['demo-create-options'] as const,
};
