import Fastify from 'fastify';

import { registerSharedContracts } from '../../src/server/shared-contracts';

/**
 * A bare Fastify instance for a test that registers Runtime routes without the composed app. It
 * has the shared contracts registered, as `configureRuntimeApp` gives every route: a route schema
 * that references a shared contract compiles only where the contract is registered.
 */
export function routeTestApp() {
  const app = Fastify();
  registerSharedContracts(app);

  return app;
}
