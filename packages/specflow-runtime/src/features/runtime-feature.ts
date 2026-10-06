import type { ResourceDefinition } from '@nevo/authorization';
import type { FastifyInstance, RawServerBase } from 'fastify';

export interface RuntimeFeature {
  readonly authorizationResources: readonly ResourceDefinition[];

  register?<RawServer extends RawServerBase>(app: FastifyInstance<RawServer>): void | Promise<void>;
}
