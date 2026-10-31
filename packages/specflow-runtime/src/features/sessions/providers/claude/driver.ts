import type { ProviderDescriptor } from '@nevo/specflow-contracts/sessions';
import { SessionError } from '../../errors';
import type { SessionDriver, Invocation } from '../driver';
import { ProviderTimeouts } from '../driver';
import {
  createInvocationScope,
  launchOwnedProcess,
  projectProviderEnvironment,
  type ProviderEnvironment,
} from '../process';
import { createClaudeOperation } from './operation';
import { inspectClaudeInstallation } from './installation';
import {
  classifyProviderInstallation,
  compatibilityForExecution,
} from '../compatibility/catalogue';
import { admitProvider } from '../compatibility/admission';
import { probeClaude, ClaudeProbeError } from './probe';
import { claudeArguments, claudeModels, verifyClaudeInit, claudeVersion } from './discovery';
import { claudeMode, claudeModes } from './modes';
import { createProviderAuthentication } from '../authentication';

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
  } = {},
): SessionDriver {
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
    title: 'Claude Code',
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
  const inspect =
    dependencies.inspect ??
    ((signal: AbortSignal) => inspectClaudeInstallation({ ...options, environment, signal }));
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
      error instanceof ClaudeProbeError
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
      ...descriptor,
      models: [],
      readiness:
        reasonCode === 'AUTHENTICATION_REQUIRED' ? 'authenticationRequired' : 'unavailable',
      reasonCode,
      reason:
        error instanceof ClaudeProbeError || error instanceof SessionError
          ? error.message
          : 'Claude availability must be rechecked.',
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

  async function refresh(signal: AbortSignal): Promise<ProviderDescriptor> {
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
          if (installation.fingerprint === checkedFingerprint && Date.now() - checkedAt < 30000) {
            return structuredClone(descriptor);
          }

          const identity = { ...installation, providerId: 'claude' };
          const known = classifyProviderInstallation(identity);
          if (known.classification === 'unsupported') {
            throw new ClaudeProbeError('KNOWN_INCOMPATIBILITY', known.reason);
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
                        throw new ClaudeProbeError(
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
            throw new ClaudeProbeError('KNOWN_INCOMPATIBILITY', admission.reason!);
          }

          descriptor = {
            ...descriptor,
            models: result.models,
            readiness: 'ready',
            compatibility: {
              classification: compatibility.classification,
              protocolProfile: 'claude-stream-json-v1',
              ...(result.version ? { version: result.version } : {}),
            },
            providerModes,
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
          checkedAt = Date.now();
          scope = installation.accountScope;

          return structuredClone(descriptor);
        }

        throw new ClaudeProbeError(
          'PROBE_FAILED',
          'Claude installation changed repeatedly during its compatibility probe.',
        );
      } catch (error) {
        invalidate(error, inspectedAuthentication);

        return structuredClone(descriptor);
      }
    })();
    try {
      return await discovery;
    } finally {
      discovery = undefined;
    }
  }

  async function readyInstallation(signal: AbortSignal) {
    for (let attempt = 0; attempt < 2; attempt++) {
      await refresh(signal);
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
        invocation.executionContext.workspace !== options.workspace
      ) {
        throw new SessionError(
          'CAPABILITY_UNSUPPORTED',
          'Verified read-only workspace is required.',
        );
      }

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
            fact.kind === 'lost' ||
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
              cwd: options.workspace,
              args: claudeArguments(invocation.selection, invocation.providerContext),
              environment,
              signal: operationSignal,
              secrets: installation.secrets,
            });
          },
          async initialize(payload) {
            const actual = claudeModels(payload);
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
          verifyFrame(frame) {
            if (!verified) {
              try {
                verifyClaudeInit(frame, options.workspace, expectedVersion, invocation.selection);
              } catch (error) {
                invalidate(
                  new ClaudeProbeError(
                    'RESTRICTION_UNSUPPORTED',
                    'Claude invocation does not satisfy the restricted protocol profile.',
                  ),
                );

                throw error;
              }

              verified = true;
            } else if (frame.type === 'system' && frame.subtype === 'init') {
              verifyClaudeInit(frame, options.workspace, expectedVersion, invocation.selection);
            }
          },
        },
      );
    },
  };
}
