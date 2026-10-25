import { SessionCapabilities } from '@nevo/specflow-contracts/sessions';

import type { RuntimeFeature } from '../runtime-feature';
import type { SessionsFeatureConfig } from './configuration';
import { openSessionStore } from './persistence/store';
import { createSessionCoordinator } from './lifecycle/coordinator';
import { createMockDriver } from './providers/mock';
import type { SessionDriver } from './providers/driver';
import { registerSessionRoutes } from './http/routes';
import { SessionError } from './errors';

export function createSessionsFeature(
  options: {
    config?: SessionsFeatureConfig;
    storage?: { directory: string; projectId: string };
    driver?: SessionDriver;
  } = {},
): RuntimeFeature {
  return {
    authorizationResources: [SessionCapabilities],
    async register(app) {
      const enabled = options.config?.enabled === true;
      if (enabled && !options.storage)
        throw new SessionError(
          'SESSION_STORE_UNAVAILABLE',
          'Verified Session storage context is required.',
        );
      const store = enabled ? await openSessionStore(options.storage!) : undefined;
      const coordinator = store
        ? createSessionCoordinator(
            store,
            options.driver ?? createMockDriver(),
            options.storage!.projectId,
            options.config?.providers.mock.enabled === true,
          )
        : undefined;
      if (coordinator) app.addHook('onClose', () => coordinator.close());
      registerSessionRoutes(app, {
        coordinator,
        projectId: options.storage?.projectId,
        mockEnabled: options.config?.providers.mock.enabled === true,
      });
    },
  };
}
