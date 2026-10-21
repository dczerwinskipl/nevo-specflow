import type { ResourceDefinition } from '@nevo/authorization';
import type { OperationKindRegistration } from './operations/kind-registration';
import type { FastifyInstance, RawServerBase } from 'fastify';

export interface RuntimeFeature {
  readonly authorizationResources: readonly ResourceDefinition[];
  /** Operation kinds this feature publishes progress for (generic operation events endpoint). */
  readonly operationKinds?: readonly OperationKindRegistration[];

  register?<RawServer extends RawServerBase>(app: FastifyInstance<RawServer>): void | Promise<void>;
}
