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
import { createCodexDriver } from './providers/codex/driver';
import { createAntigravityDriver } from './providers/antigravity/driver';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import type { SpecFlowEngine } from '@nevo/specflow-engine';
import { createEngineSessionEffects, workspaceExecutionIdentity } from './effects/engine';

export function createSessionsFeature(
  options: {
    config?: SessionsFeatureConfig;
    storage?: { directory: string; projectId: string; workspace?: string };
    driver?: SessionDriver | readonly SessionDriver[];
    engine?: SpecFlowEngine;
  } = {},
): RuntimeFeature {
  return {
    authorizationResources: [SessionCapabilities],
    async register(app) {
      const enabled = options.config?.enabled === true;
      if (enabled && !options.storage) {
        throw new SessionError(
          'SESSION_STORE_UNAVAILABLE',
          'Verified Session storage context is required.',
        );
      }

      const claude = options.config?.providers.claude;
      const codex = options.config?.providers.codex;
      const antigravity = options.config?.providers.antigravity;
      if (
        enabled &&
        (claude?.enabled || codex?.enabled || antigravity?.enabled) &&
        !options.storage?.workspace
      ) {
        throw new SessionError(
          'SESSION_STORE_UNAVAILABLE',
          'Verified workspace context is required for native providers.',
        );
      }

      const drivers: SessionDriver[] = [];
      const effects =
        enabled &&
        options.engine &&
        options.storage?.workspace === options.engine.workspace.root &&
        options.storage.projectId === options.engine.context.project.projectId
          ? createEngineSessionEffects(options.engine)
          : undefined;
      if (options.config?.providers.mock.enabled) {
        drivers.push(createMockDriver());
      }

      if (enabled && claude?.enabled) {
        drivers.push(
          createClaudeDriver({
            workspace: options.storage!.workspace!,
            temporaryRoot: join(options.storage!.directory, 'provider-temporary'),
            executable: claude.executable,
            managedWrites: effects !== undefined,
          }),
        );
      }

      if (enabled && codex?.enabled) {
        drivers.push(
          createCodexDriver({
            workspace: options.storage!.workspace!,
            temporaryRoot: join(options.storage!.directory, 'provider-temporary'),
            // Auth and native history must never be copied into the project/worktree.
            homeRoot: join(
              homedir(),
              '.nevo',
              'runtime',
              'providers',
              'codex',
              createHash('sha256').update(options.storage!.projectId).digest('hex'),
            ),
            executable: codex.executable,
            managedWrites: effects !== undefined,
          }),
        );
      }

      if (enabled && antigravity?.enabled) {
        drivers.push(
          createAntigravityDriver({
            workspace: options.storage!.workspace!,
            temporaryRoot: join(options.storage!.directory, 'provider-temporary'),
            homeRoot: join(
              homedir(),
              '.nevo',
              'runtime',
              'providers',
              'antigravity',
              createHash('sha256').update(options.storage!.projectId).digest('hex'),
            ),
            executable: antigravity.executable,
            managedWrites: effects !== undefined,
          }),
        );
      }

      const store = enabled ? await openSessionStore(options.storage!) : undefined;
      const coordinator = store
        ? createSessionCoordinator(
            store,
            options.driver ?? drivers,
            options.storage!.projectId,
            options.config?.providers.mock.enabled === true ||
              claude?.enabled === true ||
              codex?.enabled === true ||
              antigravity?.enabled === true,
            options.storage?.workspace
              ? {
                  kind: 'read-only',
                  workspace: options.storage.workspace,
                  temporaryRoot: join(options.storage.directory, 'provider-temporary'),
                  ...(effects
                    ? { workspaceIdentity: workspaceExecutionIdentity(options.engine!) }
                    : {}),
                }
              : { kind: 'no-effects' },
            effects,
          )
        : undefined;
      if (coordinator) {
        app.addHook('onClose', () => coordinator.close());
      }

      if (coordinator) {
        await coordinator.recoverEffects();
      }

      if (coordinator && (claude?.enabled || codex?.enabled || antigravity?.enabled)) {
        await coordinator.providers();
      }

      registerSessionRoutes(app, {
        coordinator,
        projectId: options.storage?.projectId,
      });
    },
  };
}
