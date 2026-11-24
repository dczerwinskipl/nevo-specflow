import type { ProviderDescriptor } from '@nevo/specflow-contracts/sessions';
import { isAbsolute } from 'node:path';
import { SessionError } from '../../errors';
import { ProviderTitles } from '../titles';
import type { SessionDriver, Invocation } from '../driver';
import { ProviderTimeouts } from '../driver';
import {
  createInvocationScope,
  launchOwnedProcess,
  projectProviderEnvironment,
  withRuntimeEntries,
  type ProviderEnvironment,
} from '../process';
import { claudeLoss, createClaudeOperation } from './operation';
import { productCliTrust } from './cli-path';
import { inspectClaudeInstallation } from './installation';
import {
  classifyProviderInstallation,
  compatibilityForExecution,
  executableCompatibility,
} from '../compatibility/catalogue';
import { admitProvider } from '../compatibility/admission';
import { probeClaude } from './probe';
import { ProviderUnavailableError, installationUnavailable } from '../unavailable';
import {
  createExecutableLocator,
  executableFields,
  withExecutableFields,
  type ExecutableResolution,
} from '../executable';
import { claudeExecutable } from './executable';
import {
  ClaudeRestrictionError,
  claudeArguments,
  claudeModels,
  verifyClaudeInit,
  verifyClaudeStatus,
  claudeVersion,
} from './discovery';
import { claudeMode, claudeModes } from './modes';
import { createProviderAuthentication } from '../authentication';

/** How long a probe's answer is kept while the installation's identity stays the same. */
export const CLAUDE_PROBE_REFRESH_MS = 15 * 60_000;
/** How often a catalogue read starts a background check of the installation's identity. */
export const CLAUDE_REVALIDATE_MS = 30_000;

export function createClaudeDriver(
  options: {
    workspace: string;
    temporaryRoot: string;
    executable?: string;
    environment?: ProviderEnvironment;
    managedWrites?: boolean;
  },
  dependencies: {
    inspect?: (
      signal: AbortSignal,
    ) => Promise<Awaited<ReturnType<typeof inspectClaudeInstallation>>>;
    probe?: typeof probeClaude;
    /** Test seam: the clock the probe's age is judged by. */
    now?: () => number;
  } = {},
): SessionDriver {
  const now = dependencies.now ?? Date.now;
  const baseEnvironment = options.environment ?? projectProviderEnvironment({ host: process.env });
  const environment: ProviderEnvironment = {
    values: Object.freeze({ ...baseEnvironment.values, CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: '1' }),
    sources: Object.freeze({
      ...baseEnvironment.sources,
      CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: 'configured',
    }),
  };
  let descriptor: ProviderDescriptor = {
    providerId: 'claude',
    title: ProviderTitles.claude,
    readiness: 'unknown',
    capabilities: {
      questions: true,
      permissions: options.managedWrites === true,
      cancel: true,
      resume: true,
      modelOverride: true,
      effortOverride: true,
    },
    models: [],
    modes: ['read-only'],
  };
  let checkedAt = 0;
  let scope = '';
  let discovery: Promise<ProviderDescriptor> | undefined;
  /** A discovery ran to its end once (ready or not): later reads serve its result at once. */
  let discovered = false;
  /** When the last background revalidation started (it reads the installation, never awaited). */
  let revalidatedAt = 0;
  const locator = createExecutableLocator(claudeExecutable, {
    ...(options.executable !== undefined ? { configured: options.executable } : {}),
    environment,
    workspace: options.workspace,
    ...executableCompatibility('claude'),
  });
  /** The executable the last inspection ran; kept on the descriptor when a later check fails. */
  let resolution: ExecutableResolution | undefined;
  const inspect =
    dependencies.inspect ??
    (async (signal: AbortSignal) => {
      resolution = undefined;
      const found = await locator.resolve(signal);
      resolution = found;

      return inspectClaudeInstallation({
        ...options,
        executable: found.path,
        environment,
        signal,
      }).catch(installationUnavailable);
    });
  const probe = dependencies.probe ?? probeClaude;
  let checkedFingerprint = '';
  const authentication = createProviderAuthentication();
  const modeModels = new Map<string, ProviderDescriptor['models']>();
  function invalidate(
    error?: unknown,
    authenticationFingerprint?: string,
    source: 'discovery' | 'operation' = 'discovery',
  ) {
    if (!error && descriptor.compatibility?.classification === 'unsupported') {
      return;
    }

    const reasonCode =
      error instanceof ProviderUnavailableError
        ? error.reasonCode
        : error instanceof SessionError && error.code === 'PROVIDER_AUTH_REQUIRED'
          ? 'AUTHENTICATION_REQUIRED'
          : error instanceof SessionError
            ? 'INSTALLATION_UNAVAILABLE'
            : 'PROBE_FAILED';
    if (reasonCode === 'AUTHENTICATION_REQUIRED' && authenticationFingerprint) {
      const current = authentication.reject(authenticationFingerprint);
      if (source === 'operation' && !current) {
        return;
      }
    }

    checkedAt = 0;
    scope = '';
    modeModels.clear();
    descriptor = {
      ...withExecutableFields(descriptor, executableFields(claudeExecutable, resolution, error)),
      models: [],
      readiness:
        reasonCode === 'AUTHENTICATION_REQUIRED' ? 'authenticationRequired' : 'unavailable',
      reasonCode,
      reason:
        error instanceof SessionError ? error.message : 'Claude availability must be rechecked.',
    };
    delete descriptor.compatibility;
    if (
      ['PROTOCOL_UNSUPPORTED', 'RESTRICTION_UNSUPPORTED', 'KNOWN_INCOMPATIBILITY'].includes(
        reasonCode,
      )
    ) {
      descriptor.compatibility = {
        classification: 'unsupported',
        protocolProfile: 'claude-stream-json-v1',
      };
    }
  }

  function requireAuthentication(fingerprint: string) {
    if (!authentication.isRejected(fingerprint)) {
      return;
    }

    const error = new SessionError(
      'PROVIDER_AUTH_REQUIRED',
      'Sign in again using the Claude CLI, then recheck provider availability.',
    );
    invalidate(error, fingerprint);

    throw error;
  }

  /**
   * The catalogue read (probe policy, see the provider reference): the first read after start
   * waits for the first discovery (the Runtime starts it eagerly); every later read returns the last
   * known descriptor at once and, at most every {@link CLAUDE_REVALIDATE_MS}, revalidates in the
   * background: the installation is read again (its executable hash is cached by identity) and the
   * CLI is probed again only when that identity changed, the last probe is older than
   * {@link CLAUDE_PROBE_REFRESH_MS}, or the descriptor was invalidated (a Turn launch found the
   * installation changed or broken). `recheck` (the owner's Check again) probes now and is awaited.
   */
  async function refresh(
    signal: AbortSignal,
    refreshOptions: { recheck?: boolean } = {},
  ): Promise<ProviderDescriptor> {
    if (refreshOptions.recheck) {
      if (!discovery) {
        locator.forget();
        checkedAt = 0;
      }

      return discover(signal);
    }

    if (!discovered) {
      return discover(signal);
    }

    if (!discovery && (checkedAt === 0 || now() - revalidatedAt >= CLAUDE_REVALIDATE_MS)) {
      revalidatedAt = now();
      // Never awaited: its outcome is the next read's descriptor.
      void discover(AbortSignal.timeout(ProviderTimeouts.discoveryMs)).catch(() => undefined);
    }

    return structuredClone(descriptor);
  }

  /** One discovery at a time; a caller during one waits for it. */
  async function discover(signal: AbortSignal): Promise<ProviderDescriptor> {
    discovery ??= (async () => {
      const boundedSignal = AbortSignal.any([
        signal,
        AbortSignal.timeout(ProviderTimeouts.discoveryMs),
      ]);
      let inspectedAuthentication: string | undefined;
      try {
        for (let attempt = 0; attempt < 2; attempt++) {
          inspectedAuthentication = undefined;
          const installation = await inspect(boundedSignal);
          inspectedAuthentication = installation.authenticationFingerprint;
          requireAuthentication(installation.authenticationFingerprint);
          if (
            installation.fingerprint === checkedFingerprint &&
            now() - checkedAt < CLAUDE_PROBE_REFRESH_MS
          ) {
            return structuredClone(descriptor);
          }

          const identity = { ...installation, providerId: 'claude' };
          const known = classifyProviderInstallation(identity);
          if (known.classification === 'unsupported') {
            throw new ProviderUnavailableError('KNOWN_INCOMPATIBILITY', known.reason);
          }

          const result = await probe({
            ...installation,
            workspace: options.workspace,
            temporaryRoot: options.temporaryRoot,
            environment,
            signal: boundedSignal,
          });
          const available = new Map<string, ProviderDescriptor['models']>([
            ['plan', result.models],
          ]);
          const providerModes: NonNullable<ProviderDescriptor['providerModes']> = [];
          let authenticationFailure: SessionError | undefined;
          // At most two CLI probes run together; avoid serial startup latency
          // while retaining a fixed process bound and deterministic catalogue order.
          for (let offset = 0; offset < claudeModes.length; offset += 2) {
            const checkedModes = await Promise.all(
              claudeModes.slice(offset, offset + 2).map(async (mode) => {
                let reason: string | undefined;
                let modeCompatibility = compatibilityForExecution(
                  classifyProviderInstallation({ ...identity, ...result }),
                  mode.mode,
                ).classification;
                if (mode.mode === 'workspace-write') {
                  if (!options.managedWrites) {
                    reason = 'Managed workspace execution is unavailable.';
                  } else {
                    try {
                      const native = await probe({
                        ...installation,
                        workspace: options.workspace,
                        temporaryRoot: options.temporaryRoot,
                        environment,
                        signal: boundedSignal,
                        selection: {
                          providerId: 'claude',
                          mode: mode.mode,
                          providerModeId: mode.modeId,
                        },
                      });
                      const compatible = compatibilityForExecution(
                        classifyProviderInstallation({ ...identity, ...native }),
                        mode.mode,
                      );
                      modeCompatibility = compatible.classification;
                      const admitted = admitProvider(compatible, {
                        configured: true,
                        authenticated: true,
                        executionPolicyChecked: true,
                        protocolVerified: true,
                        executionMode: mode.mode,
                        managedEffectsAvailable: options.managedWrites,
                      });
                      if (!admitted.allowed) {
                        throw new ProviderUnavailableError(
                          'KNOWN_INCOMPATIBILITY',
                          'Native mode admission failed.',
                        );
                      }

                      available.set(mode.modeId, native.models);
                    } catch (error) {
                      if (
                        error instanceof SessionError &&
                        error.code === 'PROVIDER_AUTH_REQUIRED'
                      ) {
                        authenticationFailure = error;
                      }

                      reason = 'The installed Claude could not initialize this native mode.';
                    }
                  }
                }

                return {
                  ...mode,
                  compatibility: modeCompatibility,
                  readiness: reason ? ('unavailable' as const) : ('ready' as const),
                  ...(reason ? { reason } : {}),
                };
              }),
            );
            if (authenticationFailure) {
              throw authenticationFailure;
            }

            providerModes.push(...checkedModes);
          }

          inspectedAuthentication = undefined;
          const after = await inspect(boundedSignal);
          if (after.fingerprint !== installation.fingerprint) {
            continue;
          }

          requireAuthentication(installation.authenticationFingerprint);
          const compatibility = classifyProviderInstallation({ ...identity, ...result });
          const admission = admitProvider(compatibility, {
            configured: true,
            authenticated: true,
            executionPolicyChecked: true,
            protocolVerified: true,
            executionMode: 'read-only',
          });
          if (!admission.allowed) {
            throw new ProviderUnavailableError('KNOWN_INCOMPATIBILITY', admission.reason!);
          }

          descriptor = {
            ...withExecutableFields(descriptor, executableFields(claudeExecutable, resolution)),
            models: result.models,
            readiness: 'ready',
            compatibility: {
              classification: compatibility.classification,
              protocolProfile: 'claude-stream-json-v1',
              ...(result.version ? { version: result.version } : {}),
            },
            // A mode that runs only some models names them, so a client offers no pair that
            // validate would refuse.
            providerModes: providerModes.map((mode) => {
              const runs = available.get(mode.modeId);

              return runs && runs.length !== result.models.length
                ? { ...mode, modelIds: runs.map((model) => model.modelId) }
                : mode;
            }),
            defaultModeId: options.managedWrites ? 'acceptEdits' : 'plan',
            modes: options.managedWrites ? ['read-only', 'workspace-write'] : ['read-only'],
          };
          modeModels.clear();
          for (const [mode, models] of available) {
            modeModels.set(mode, models);
          }

          delete descriptor.reason;
          delete descriptor.reasonCode;
          checkedFingerprint = installation.fingerprint;
          authentication.verified(installation.authenticationFingerprint);
          checkedAt = now();
          scope = installation.accountScope;

          return structuredClone(descriptor);
        }

        throw new ProviderUnavailableError(
          'PROBE_FAILED',
          'Claude installation changed repeatedly during its compatibility probe.',
        );
      } catch (error) {
        invalidate(error, inspectedAuthentication);

        return structuredClone(descriptor);
      }
    })();
    const running = discovery;
    try {
      return await running;
    } finally {
      discovered = true;
      if (discovery === running) {
        discovery = undefined;
      }
    }
  }

  async function readyInstallation(signal: AbortSignal) {
    for (let attempt = 0; attempt < 2; attempt++) {
      // A Turn never runs on a stale answer: the first attempt checks (a fresh probe is reused),
      // the second, after the installation changed, probes again.
      if (attempt === 0) {
        await discover(signal);
      } else {
        checkedAt = 0;
        await discover(signal);
      }

      if (descriptor.readiness !== 'ready') {
        throw new SessionError(
          descriptor.readiness === 'authenticationRequired'
            ? 'PROVIDER_AUTH_REQUIRED'
            : 'PROVIDER_UNAVAILABLE',
          descriptor.reason ?? 'Claude is unavailable.',
        );
      }

      const installation = await inspect(signal).catch((error: unknown) => {
        invalidate(error);

        throw error;
      });
      if (installation.fingerprint === checkedFingerprint && installation.accountScope === scope) {
        requireAuthentication(installation.authenticationFingerprint);

        return installation;
      }
    }

    invalidate();

    throw new SessionError(
      'PROVIDER_UNAVAILABLE',
      'Claude installation changed before invocation.',
    );
  }

  function validateModel(selection: Invocation['selection']) {
    const profile = claudeMode(selection);
    const models = modeModels.get(profile.modeId);
    if (!models) {
      throw new SessionError(
        'CAPABILITY_UNSUPPORTED',
        'Requested native Claude mode is unavailable.',
      );
    }

    if (!selection.modelId && !selection.effort) {
      return;
    }

    const model = models.find((model) => model.modelId === (selection.modelId ?? 'default'));
    if (
      !model &&
      profile.modeId === 'auto' &&
      modeModels.get('plan')?.some((entry) => entry.modelId === (selection.modelId ?? 'default'))
    ) {
      throw new SessionError(
        'MODEL_UNSUPPORTED',
        'The installed Claude has no auto mode for this model; choose another model or mode.',
        { reason: 'mode-model-unsupported', field: 'providerModeId' },
      );
    }

    if (!model) {
      throw new SessionError('MODEL_UNSUPPORTED', 'Requested Claude model is unavailable.');
    }

    if (selection.effort && !model.efforts.includes(selection.effort)) {
      throw new SessionError(
        'CAPABILITY_UNSUPPORTED',
        'Requested Claude effort is unavailable for this model.',
      );
    }
  }

  return {
    telemetryGroups: ['usage', 'cost', 'limits'],
    supportsManagedWrites: options.managedWrites === true,
    supportsPermissionAllowlist: true,
    supportsSessionWorkspaces: true,
    describe: () => structuredClone(descriptor),
    refresh,
    contextScope: () => scope,
    async validate(selection, signal = AbortSignal.timeout(ProviderTimeouts.discoveryMs)) {
      if (selection.providerId !== 'claude') {
        throw new SessionError('PROVIDER_UNAVAILABLE', 'Claude provider identity is required.');
      }

      if (selection.mode === 'workspace-write' && !options.managedWrites) {
        throw new SessionError(
          'CAPABILITY_UNSUPPORTED',
          'Claude writable dispatch requires Engine effect admission.',
        );
      }

      await readyInstallation(signal);
      validateModel(selection);
    },
    start(invocation, emit, signal) {
      if (
        (invocation.executionContext.kind !== 'read-only' &&
          invocation.executionContext.kind !== 'workspace-write') ||
        (invocation.selection.mode === 'workspace-write' &&
          (!options.managedWrites ||
            invocation.executionContext.kind !== 'workspace-write' ||
            invocation.executionContext.admission.operationId !== invocation.invocationId)) ||
        invocation.executionContext.kind !== invocation.selection.mode ||
        // The Runtime's checkout or a Specification's verified worktree (a write's folder is
        // checked against the Engine claim before any driver starts: managed-invocation).
        !isAbsolute(invocation.executionContext.workspace)
      ) {
        throw new SessionError(
          'CAPABILITY_UNSUPPORTED',
          'Verified read-only workspace is required.',
        );
      }

      const workspace = invocation.executionContext.workspace;
      let verified = false;
      let expectedVersion: string | undefined;
      let launchFingerprint: string | undefined;
      let launchAuthentication: string | undefined;
      let dispatched = false;
      const beforeDispatch = invocation.beforeDispatch;

      return createClaudeOperation(
        {
          ...invocation,
          ...(beforeDispatch
            ? {
                beforeDispatch: async () => {
                  await beforeDispatch();
                  if (launchAuthentication) {
                    requireAuthentication(launchAuthentication);
                  }

                  dispatched = true;
                },
              }
            : {}),
        },
        async (fact) => {
          if (
            // A frame this adapter refused says nothing about Claude's availability.
            (fact.kind === 'lost' && !fact.message.startsWith(claudeLoss.rejected)) ||
            (fact.kind === 'outcome' &&
              fact.error &&
              [
                'PROVIDER_UNAVAILABLE',
                'PROVIDER_AUTH_REQUIRED',
                'PROCESS_FAILED',
                'TIMEOUT',
              ].includes(fact.error.code))
          ) {
            invalidate(
              fact.kind === 'outcome' && fact.error?.code === 'PROVIDER_AUTH_REQUIRED'
                ? new SessionError('PROVIDER_AUTH_REQUIRED', fact.error.message)
                : undefined,
              dispatched ? launchAuthentication : undefined,
              dispatched ? 'operation' : 'discovery',
            );
          }

          await emit(fact);
        },
        signal,
        {
          async launch(operationSignal) {
            const installation = await readyInstallation(operationSignal);
            launchFingerprint = installation.fingerprint;
            launchAuthentication = installation.authenticationFingerprint;
            validateModel(invocation.selection);
            if (installation.accountScope !== invocation.providerContext?.scope) {
              throw new SessionError(
                'SESSION_RECOVERY_REQUIRED',
                'Claude account changed after native context admission.',
              );
            }

            const temporary = await createInvocationScope(
              options.temporaryRoot,
              invocation.invocationId,
            );

            return launchOwnedProcess({
              invocationId: invocation.invocationId,
              scope: temporary,
              executable: installation.executable,
              cwd: workspace,
              args: claudeArguments(
                invocation.selection,
                invocation.providerContext,
                invocation.permissions,
              ),
              environment: withRuntimeEntries(environment, invocation.runtimeEnvironment?.values),
              signal: operationSignal,
              secrets: [...installation.secrets, ...(invocation.runtimeEnvironment?.secrets ?? [])],
              ...(invocation.recordProcess ? { record: invocation.recordProcess } : {}),
            });
          },
          async initialize(payload) {
            const actual = claudeModels(payload, claudeMode(invocation.selection).modeId);
            const model =
              invocation.selection.modelId ?? (invocation.selection.effort ? 'default' : undefined);
            if (
              model &&
              !actual.some(
                (entry) =>
                  entry.modelId === model &&
                  (!invocation.selection.effort ||
                    entry.efforts.includes(invocation.selection.effort)),
              )
            ) {
              throw new SessionError(
                'MODEL_UNSUPPORTED',
                'Claude model capabilities changed before dispatch.',
              );
            }

            const current = await inspect(signal);
            if (
              current.fingerprint !== launchFingerprint ||
              current.accountScope !== invocation.providerContext?.scope
            ) {
              throw new SessionError(
                'SESSION_RECOVERY_REQUIRED',
                'Claude installation changed before dispatch.',
              );
            }

            requireAuthentication(current.authenticationFingerprint);
            expectedVersion = claudeVersion(payload);
          },
          productCli: productCliTrust({
            pathValue: Object.entries(environment.values).find(
              ([name]) => name.toUpperCase() === 'PATH',
            )?.[1],
            platform: process.platform,
            workspace,
          }),
          verifyFrame(frame) {
            const status = frame.type === 'system' && frame.subtype === 'status';
            if (!verified) {
              try {
                if (status) {
                  // Claude may report its permission mode before system/init.
                  verifyClaudeStatus(frame, invocation.selection, expectedVersion);

                  return;
                }

                verifyClaudeInit(frame, workspace, expectedVersion, invocation.selection);
              } catch (error) {
                invalidate(
                  new ProviderUnavailableError(
                    'RESTRICTION_UNSUPPORTED',
                    error instanceof ClaudeRestrictionError
                      ? error.message
                      : 'Claude invocation does not satisfy the restricted protocol profile.',
                  ),
                );

                throw error;
              }

              verified = true;
            } else if (status) {
              verifyClaudeStatus(frame, invocation.selection, expectedVersion);
            } else if (frame.type === 'system' && frame.subtype === 'init') {
              verifyClaudeInit(frame, workspace, expectedVersion, invocation.selection);
            }
          },
        },
      );
    },
  };
}
