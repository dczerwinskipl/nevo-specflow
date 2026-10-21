import type { RuntimeFeature } from '../runtime-feature';
import { operationProgressEndpoint } from './endpoint';
import type { OperationKindRegistration } from './kind-registration';
import {
  createOperationProgressRegistry,
  type OperationProgressRegistry,
} from './progress-registry';

export interface OperationsFeatureOptions {
  readonly registry?: OperationProgressRegistry;
  readonly kinds: readonly OperationKindRegistration[];
  readonly heartbeatMs?: number;
  readonly waitMs?: number;
}

export function createOperationsFeature(options: OperationsFeatureOptions): RuntimeFeature {
  const registry = options.registry ?? createOperationProgressRegistry();
  return {
    authorizationResources: [],
    register(app) {
      app.register(operationProgressEndpoint, {
        registry,
        kinds: options.kinds,
        ...(options.heartbeatMs !== undefined ? { heartbeatMs: options.heartbeatMs } : {}),
        ...(options.waitMs !== undefined ? { waitMs: options.waitMs } : {}),
      });
    },
  };
}
