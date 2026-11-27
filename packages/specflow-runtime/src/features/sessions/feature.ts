import { SessionCapabilities } from '@nevo/specflow-contracts/sessions';
import type { AgentStepOrigins } from './http/agent-step';

import type { RuntimeFeature } from '../runtime-feature';
import type { SessionsFeatureConfig } from './configuration';
import { openSessionStore } from './persistence/store';
import { createSessionCoordinator } from './lifecycle/coordinator';
import { createMockDriver } from './providers/mock';
import type { SessionDriver } from './providers/driver';
import { registerSessionRoutes } from './http/routes';
import type { SessionListSource } from './http/list';
import type { DemoManagedSessionReads } from './demo/managed-reads';
import { SessionError } from './errors';
import { createClaudeDriver } from './providers/claude/driver';
import { createCodexDriver } from './providers/codex/driver';
import { createAntigravityDriver } from './providers/antigravity/driver';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import type { SpecFlowEngine } from '@nevo/specflow-engine';
import {
  createEngineSessionEffects,
  workspaceExecutionIdentity,
  type AgentAttemptSettlement,
  type AgentTurnAdmission,
} from './effects/engine';
import type { SessionCoordinator } from './lifecycle/coordinator';
import { createSpecificationWorkspaceResolver } from './workspace/specification-workspace';
import { withheldProviderDescriptor } from './providers/withheld';
import type { InvocationCapabilities } from './lifecycle/invocation-capabilities';

/**
 * The registered Sessions runtime, read at request time by the features composed over it (the
 * Session association module). `coordinator` is absent while managed Sessions are disabled.
 */
export interface SessionsRuntime {
  readonly coordinator: SessionCoordinator | undefined;
  /** The verified Session store project. */
  readonly projectId: string | undefined;
}

export function createSessionsFeature(
  options: {
    config?: SessionsFeatureConfig;
    storage?: { directory: string; projectId: string; workspace?: string };
    driver?: SessionDriver | readonly SessionDriver[];
    /** Demo mode: the catalogue's Session list, served without managed Sessions. */
    demoList?: { source: SessionListSource; projectId: string };
    /** Demo mode: the read-only reads of the managed Session screen. */
    demoReads?: DemoManagedSessionReads;
    engine?: SpecFlowEngine;
    /** Turns registered by workspace, shared with Close (the composition root wires one). */
    workspaceOccupancy?: {
      beginTurn(workspaceId: string, sessionId: string): { end(): void } | undefined;
    };
    /** The invocation capabilities of write Turns (the agent-execution feature, D11). */
    invocationCapabilities?: InvocationCapabilities;
    /** The finalize that settles a Turn of an agent attempt (the agent-execution feature, D12). */
    settleAgentAttempt?: AgentAttemptSettlement;
    /** The admission and abandon judgement of agent attempt Turns (the agent-execution feature). */
    agentTurns?: AgentTurnAdmission;
    /** The step and attempt of agent step execution Sessions (the agent-execution feature). */
    agentStepOrigins?: AgentStepOrigins;
  } = {},
): RuntimeFeature & { readonly runtime: SessionsRuntime } {
  let registered: SessionCoordinator | undefined;
  const runtime: SessionsRuntime = {
    get coordinator() {
      return registered;
    },
    projectId: options.storage?.projectId,
  };

  return {
    runtime,
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
          ? createEngineSessionEffects(options.engine, {
              ...(options.settleAgentAttempt
                ? { settleAgentAttempt: options.settleAgentAttempt }
                : {}),
              ...(options.agentTurns ? { agentTurns: options.agentTurns } : {}),
            })
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
            logRejection: (reason) => app.log.warn({ provider: 'claude' }, reason),
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
              createHash('sha256').update(options.storage!.projectId).digest('base64url'),
            ),
            executable: antigravity.executable,
            // File hooks hold native path identities; commands need one-shot host approval.
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
            // Only an Engine opened in the verified Session workspace resolves Specification
            // workspaces; without one every Session keeps the Runtime's checkout.
            options.engine && options.storage?.workspace === options.engine.workspace.root
              ? createSpecificationWorkspaceResolver(options.engine)
              : undefined,
            options.workspaceOccupancy,
            options.invocationCapabilities,
          )
        : undefined;
      if (coordinator) {
        app.addHook('onClose', () => coordinator.close());
      }

      registered = coordinator;

      if (coordinator) {
        await coordinator.recoverEffects();
      }

      // The first probe of each provider starts now, in the background: startup does not wait for
      // it, and the first catalogue read waits only for what is still running of it.
      if (coordinator && (claude?.enabled || codex?.enabled || antigravity?.enabled)) {
        void coordinator.providers().catch(() => undefined);
      }

      registerSessionRoutes(app, {
        coordinator,
        projectId: options.storage?.projectId,
        ...(enabled && options.config?.withheld
          ? { withheldProviders: options.config.withheld.map(withheldProviderDescriptor) }
          : {}),
        ...(options.demoList ? { demoList: options.demoList } : {}),
        ...(options.demoReads ? { demoReads: options.demoReads } : {}),
        ...(options.agentStepOrigins ? { agentStepOrigins: options.agentStepOrigins } : {}),
        ...(options.agentTurns?.ownerTurnHold
          ? { ownerTurnHold: options.agentTurns.ownerTurnHold.bind(options.agentTurns) }
          : {}),
      });
    },
  };
}
