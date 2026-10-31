import type { ProviderDescriptor } from '@nevo/specflow-contracts/sessions';
import { SessionError } from '../../errors';
import { ProviderTimeouts, type SessionDriver, type Invocation } from '../driver';
import { createInvocationScope, launchOwnedProcess } from '../process';
import {
  classifyProviderInstallation,
  compatibilityForExecution,
} from '../compatibility/catalogue';
import { admitProvider } from '../compatibility/admission';
import { inspectCodexInstallation, codexArguments } from './installation';
import { probeCodex } from './probe';
import { codexMode, codexModes } from './modes';
import { CodexRpcError } from './rpc';
import { createCodexOperation } from './operation';
import { createProviderAuthentication } from '../authentication';
import { readCodexLimits } from './telemetry';

export function createCodexDriver(
  options: {
    workspace: string;
    temporaryRoot: string;
    homeRoot: string;
    executable?: string;
    managedWrites?: boolean;
  },
  dependencies: {
    inspect?: (signal: AbortSignal) => ReturnType<typeof inspectCodexInstallation>;
    probe?: typeof probeCodex;
    readLimits?: typeof readCodexLimits;
  } = {},
): SessionDriver {
  const inspect =
    dependencies.inspect ??
    ((signal: AbortSignal) => inspectCodexInstallation({ ...options, signal }));
  const probe = dependencies.probe ?? probeCodex;
  let descriptor: ProviderDescriptor = {
    providerId: 'codex',
    title: 'Codex',
    readiness: 'unknown',
    models: [],
    modes: ['read-only'],
    capabilities: {
      questions: true,
      permissions: options.managedWrites === true,
      cancel: true,
      resume: true,
      modelOverride: true,
      effortOverride: true,
    },
  };
  let checkedAt = 0,
    checkedFingerprint = '',
    scope = '';
  let discovery: Promise<ProviderDescriptor> | undefined;
  const authentication = createProviderAuthentication();
  function invalidate(
    error?: unknown,
    authenticationFingerprint?: string,
    source: 'discovery' | 'operation' = 'discovery',
  ) {
    const authRequired = error instanceof SessionError && error.code === 'PROVIDER_AUTH_REQUIRED';
    if (authRequired && authenticationFingerprint) {
      const current = authentication.reject(authenticationFingerprint);
      if (source === 'operation' && !current) {
        return;
      }
    }

    checkedAt = 0;
    scope = '';
    const incompatible = error instanceof CodexRpcError && error.kind === 'protocol';
    descriptor = {
      ...descriptor,
      models: [],
      readiness: authRequired ? 'authenticationRequired' : 'unavailable',
      reasonCode: authRequired
        ? 'AUTHENTICATION_REQUIRED'
        : incompatible
          ? 'PROTOCOL_UNSUPPORTED'
          : 'PROBE_FAILED',
      reason:
        error instanceof SessionError ? error.message : 'Codex availability must be rechecked.',
    };
    delete descriptor.compatibility;
    if (incompatible) {
      descriptor.compatibility = {
        classification: 'unsupported',
        protocolProfile: 'codex-app-server-v2',
      };
    }
  }

  function requireAuthentication(fingerprint: string) {
    if (!authentication.isRejected(fingerprint)) {
      return;
    }

    const error = new SessionError(
      'PROVIDER_AUTH_REQUIRED',
      'Sign in again using the Codex CLI, then recheck provider availability.',
    );
    invalidate(error, fingerprint);

    throw error;
  }

  async function refresh(signal: AbortSignal): Promise<ProviderDescriptor> {
    discovery ??= (async () => {
      const bounded = AbortSignal.any([signal, AbortSignal.timeout(ProviderTimeouts.discoveryMs)]);
      let inspectedAuthentication: string | undefined;
      try {
        for (let attempt = 0; attempt < 2; attempt++) {
          inspectedAuthentication = undefined;
          const installation = await inspect(bounded);
          inspectedAuthentication = installation.authenticationFingerprint;
          requireAuthentication(installation.authenticationFingerprint);
          if (installation.fingerprint === checkedFingerprint && Date.now() - checkedAt < 30000) {
            return structuredClone(descriptor);
          }

          const compatibility = classifyProviderInstallation({
            ...installation,
            providerId: 'codex',
          });
          if (compatibility.classification === 'unsupported') {
            throw new SessionError('PROVIDER_UNAVAILABLE', compatibility.reason);
          }

          const result = await probe({
            ...installation,
            workspace: options.workspace,
            temporaryRoot: options.temporaryRoot,
            signal: bounded,
          });
          inspectedAuthentication = undefined;
          if ((await inspect(bounded)).fingerprint !== installation.fingerprint) {
            continue;
          }

          requireAuthentication(installation.authenticationFingerprint);
          const modes = codexModes.map((mode) => {
            const compatible = compatibilityForExecution(compatibility, mode.mode);
            const supported = result.modes.includes(mode.nativeMode);
            const enforcement =
              mode.mode === 'workspace-write' ? result.boundary.write : result.boundary.readOnly;
            const admission = admitProvider(compatible, {
              configured: true,
              authenticated: true,
              protocolVerified: supported,
              securityVerified: enforcement,
              executionMode: mode.mode,
              managedEffectsAvailable: options.managedWrites,
            });
            let reason: string | undefined;
            if (!supported) {
              reason = 'The installed Codex does not expose this native mode.';
            } else if (mode.mode === 'workspace-write' && !options.managedWrites) {
              reason = 'Managed workspace execution is unavailable.';
            } else if (!enforcement) {
              reason = 'Native Codex execution restrictions could not be verified.';
            }

            return {
              modeId: mode.modeId,
              nativeMode: mode.nativeMode,
              title: mode.title,
              mode: mode.mode,
              compatibility: compatible.classification,
              readiness: admission.allowed ? ('ready' as const) : ('unavailable' as const),
              ...(reason ? { reason } : {}),
            };
          });
          descriptor = {
            ...descriptor,
            models: result.models,
            providerModes: modes,
            defaultModeId: options.managedWrites ? 'default' : 'plan',
            modes: options.managedWrites ? ['read-only', 'workspace-write'] : ['read-only'],
            readiness: modes.some((mode) => mode.readiness === 'ready') ? 'ready' : 'unavailable',
            compatibility: {
              classification: compatibility.classification,
              protocolProfile: 'codex-app-server-v2',
              ...(installation.version ? { version: installation.version } : {}),
            },
          };
          delete descriptor.reason;
          delete descriptor.reasonCode;
          if (descriptor.readiness !== 'ready') {
            descriptor.reason = 'No Codex execution mode is currently available.';
          }

          checkedFingerprint = installation.fingerprint;
          authentication.verified(installation.authenticationFingerprint);
          checkedAt = Date.now();
          scope = installation.accountScope;

          return structuredClone(descriptor);
        }

        throw new SessionError(
          'PROVIDER_UNAVAILABLE',
          'Codex installation changed repeatedly during discovery.',
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
          descriptor.reason ?? 'Codex is unavailable.',
        );
      }

      const current = await inspect(signal).catch((error: unknown) => {
        invalidate(error);

        throw error;
      });
      if (current.fingerprint === checkedFingerprint && current.accountScope === scope) {
        requireAuthentication(current.authenticationFingerprint);

        return current;
      }
    }

    invalidate();

    throw new SessionError('PROVIDER_UNAVAILABLE', 'Codex installation changed before invocation.');
  }

  function validateSelection(selection: Invocation['selection']) {
    const mode = codexMode(selection);
    if (
      descriptor.providerModes?.find((item) => item.modeId === mode.modeId)?.readiness !== 'ready'
    ) {
      throw new SessionError(
        'CAPABILITY_UNSUPPORTED',
        'Requested native Codex mode is unavailable.',
      );
    }

    if (!selection.modelId && !selection.effort) {
      return;
    }

    const model = descriptor.models.find((model) => model.modelId === selection.modelId);
    if (!model) {
      throw new SessionError(
        'MODEL_UNSUPPORTED',
        'Select an available native Codex model before overriding model or effort.',
      );
    }

    if (selection.effort && !model.efforts.includes(selection.effort)) {
      throw new SessionError(
        'CAPABILITY_UNSUPPORTED',
        'Requested Codex effort is unavailable for this model.',
      );
    }
  }

  return {
    telemetryGroups: ['usage', 'limits', 'context'],
    telemetry: {
      refreshableGroups: ['limits'],
      async binding(signal) {
        const current = await inspect(AbortSignal.any([signal, AbortSignal.timeout(10000)]));
        requireAuthentication(current.authenticationFingerprint);

        return {
          accountScope: current.accountScope,
          credentialGeneration: current.authenticationFingerprint,
        };
      },
      async refresh(request, signal) {
        const bounded = AbortSignal.any([signal, AbortSignal.timeout(10000)]);
        if (request.groups.length !== 1 || request.groups[0] !== 'limits') {
          throw new SessionError(
            'CAPABILITY_UNSUPPORTED',
            'Only Codex account limits support a read-only refresh.',
          );
        }

        const installation = await inspect(bounded);
        const matches = (current: typeof installation) =>
          current.accountScope === request.binding.accountScope &&
          current.authenticationFingerprint === request.binding.credentialGeneration;
        if (!matches(installation)) {
          throw new SessionError('PROVIDER_UNAVAILABLE', 'Codex account binding changed.');
        }

        requireAuthentication(installation.authenticationFingerprint);
        const windows = await (dependencies.readLimits ?? readCodexLimits)({
          ...installation,
          workspace: options.workspace,
          temporaryRoot: options.temporaryRoot,
          signal: bounded,
        });
        const current = await inspect(bounded);
        bounded.throwIfAborted();
        if (!matches(current) || current.fingerprint !== installation.fingerprint) {
          throw new SessionError(
            'PROVIDER_UNAVAILABLE',
            'Codex changed during account telemetry refresh.',
          );
        }

        requireAuthentication(current.authenticationFingerprint);

        return [
          {
            kind: 'measurement',
            metric: 'limits',
            sampleId: 'codex-account-limits',
            value: { windows },
          },
        ];
      },
    },
    nativeContextMode: 'provider-assigned',
    supportsManagedWrites: options.managedWrites === true,
    describe: () => structuredClone(descriptor),
    refresh,
    contextScope: () => scope,
    async validate(selection, signal = AbortSignal.timeout(ProviderTimeouts.discoveryMs)) {
      if (selection.providerId !== 'codex') {
        throw new SessionError('PROVIDER_UNAVAILABLE', 'Codex provider identity is required.');
      }

      await readyInstallation(signal);
      validateSelection(selection);
    },
    start(invocation, emit, signal) {
      const context = invocation.executionContext;
      if (
        (context.kind !== 'read-only' && context.kind !== 'workspace-write') ||
        context.workspace !== options.workspace ||
        context.kind !== invocation.selection.mode ||
        (context.kind === 'workspace-write' &&
          (!options.managedWrites || context.admission.operationId !== invocation.invocationId))
      ) {
        throw new SessionError(
          'CAPABILITY_UNSUPPORTED',
          'Verified matching workspace execution authority is required.',
        );
      }

      let fingerprint: string | undefined;
      let launchAuthentication: string | undefined;
      let nativeHome: string | undefined;
      let dispatched = false;
      const beforeDispatch = invocation.beforeDispatch;

      return createCodexOperation(
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
              ['PROVIDER_UNAVAILABLE', 'PROVIDER_AUTH_REQUIRED', 'TIMEOUT'].includes(
                fact.error.code,
              ))
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
          workspace: options.workspace,
          home() {
            if (!nativeHome) {
              throw new CodexRpcError('protocol');
            }

            return nativeHome;
          },
          async beforeInput(operationSignal) {
            const current = await inspect(operationSignal);
            if (
              current.fingerprint !== fingerprint ||
              current.accountScope !== invocation.providerContext?.scope
            ) {
              throw new SessionError(
                'SESSION_RECOVERY_REQUIRED',
                'Codex installation or account changed before dispatch.',
              );
            }

            requireAuthentication(current.authenticationFingerprint);
          },
          async launch(operationSignal) {
            const installation = await readyInstallation(operationSignal);
            validateSelection(invocation.selection);
            if (installation.accountScope !== invocation.providerContext?.scope) {
              throw new SessionError(
                'SESSION_RECOVERY_REQUIRED',
                'Codex account changed after native context admission.',
              );
            }

            fingerprint = installation.fingerprint;
            launchAuthentication = installation.authenticationFingerprint;
            nativeHome = installation.home;
            const temporary = await createInvocationScope(
              options.temporaryRoot,
              invocation.invocationId,
            );

            return launchOwnedProcess({
              ...installation,
              invocationId: invocation.invocationId,
              scope: temporary,
              cwd: options.workspace,
              args: codexArguments(options.workspace, false, invocation.selection),
              signal: operationSignal,
            });
          },
        },
      );
    },
  };
}
