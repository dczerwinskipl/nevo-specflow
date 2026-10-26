import { SessionCapabilities } from '@nevo/specflow-contracts/sessions';

import type { RuntimeFeature } from '../runtime-feature';
import type { SessionsFeatureConfig } from './configuration';
import { openSessionStore } from './persistence/store';
import { createSessionCoordinator } from './lifecycle/coordinator';
import { createMockDriver } from './providers/mock';
import type { SessionDriver } from './providers/driver';
import { registerSessionRoutes } from './http/routes';
import { SessionError } from './errors';
import { createClaudeDriver } from './providers/claude/driver';
import { join } from 'node:path';

export function createSessionsFeature(
  options: {
    config?: SessionsFeatureConfig;
    storage?: { directory: string; projectId: string; workspace?: string };
    driver?: SessionDriver | readonly SessionDriver[];
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
      const claude = options.config?.providers.claude;
      if (enabled && claude?.enabled && !options.storage?.workspace)
        throw new SessionError(
          'SESSION_STORE_UNAVAILABLE',
          'Verified workspace context is required for Claude.',
        );
      const drivers: SessionDriver[] = [];
      if (options.config?.providers.mock.enabled) drivers.push(createMockDriver());
      if (enabled && claude?.enabled)
        drivers.push(
          createClaudeDriver({
            workspace: options.storage!.workspace!,
            temporaryRoot: join(options.storage!.directory, 'provider-temporary'),
            executable: claude.executable,
          }),
        );
      const store = enabled ? await openSessionStore(options.storage!) : undefined;
      const coordinator = store
        ? createSessionCoordinator(
            store,
            options.driver ?? drivers,
            options.storage!.projectId,
            options.config?.providers.mock.enabled === true || claude?.enabled === true,
            options.storage?.workspace
              ? {
                  kind: 'read-only',
                  workspace: options.storage.workspace,
                  temporaryRoot: join(options.storage.directory, 'provider-temporary'),
                }
              : { kind: 'no-effects' },
          )
        : undefined;
      if (coordinator) app.addHook('onClose', () => coordinator.close());
      if (coordinator && claude?.enabled) await coordinator.providers();
      registerSessionRoutes(app, {
        coordinator,
        projectId: options.storage?.projectId,
      });
    },
  };
}
