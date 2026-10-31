import { createHash, randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ProviderDescriptor } from '@nevo/specflow-contracts/sessions';
import { SessionError } from '../../errors';
import { ProviderTimeouts, type Invocation, type SessionDriver } from '../driver';
import { createInvocationScope, launchOwnedProcess } from '../process';
import { createProviderAuthentication } from '../authentication';
import { classifyProviderInstallation } from '../compatibility/catalogue';
import { admitProvider } from '../compatibility/admission';
import { antigravityArguments, antigravityMode, antigravityModes } from './discovery';
import {
  inspectAntigravityInstallation,
  prepareAntigravityProfile,
  type AntigravityInstallation,
} from './installation';
import { probeAntigravity } from './probe';
import { createAntigravityOperation } from './operation';
import { createAntigravityQuestionBridge } from './question-bridge';
import { antigravityHooks } from './hook-launcher';
import { AntigravityProtocolError, type AntigravityInit } from './protocol';

const cacheMs = 30000;
// Keep all 256 identity bits while avoiding the native Windows HOME length limit.
const digest = (value: string) => createHash('sha256').update(value).digest('base64url');

export function createAntigravityDriver(
  options: {
    workspace: string;
    temporaryRoot: string;
    homeRoot: string;
    executable?: string;
    managedWrites?: boolean;
  },
  dependencies: {
    inspect?: (signal: AbortSignal) => Promise<AntigravityInstallation>;
    probe?: typeof probeAntigravity;
    launch?: typeof launchOwnedProcess;
    helper?: string;
  } = {},
): SessionDriver {
  const inspect =
    dependencies.inspect ??
    ((signal: AbortSignal) => inspectAntigravityInstallation({ ...options, signal }));
  const probe = dependencies.probe ?? probeAntigravity;
  const launch = dependencies.launch ?? launchOwnedProcess;
  const authentication = createProviderAuthentication();
  let descriptor: ProviderDescriptor = {
    providerId: 'antigravity',
    title: 'Antigravity',
    readiness: 'unknown',
    models: [],
    modes: ['workspace-write'],
    capabilities: {
      questions: true,
      permissions: true,
      cancel: true,
      resume: true,
      modelOverride: true,
      effortOverride: false,
    },
  };
  let scope = '';
  let checkedFingerprint = '';
  let checkedAt = 0;
  let discovery: Promise<ProviderDescriptor> | undefined;

  function invalidate(error?: unknown, fingerprint?: string) {
    const authRequired = error instanceof SessionError && error.code === 'PROVIDER_AUTH_REQUIRED';
    if (authRequired && fingerprint && !authentication.reject(fingerprint)) {
      return;
    }

    checkedAt = 0;
    scope = '';
    descriptor = {
      ...descriptor,
      models: [],
      readiness: authRequired ? 'authenticationRequired' : 'unavailable',
      reasonCode: authRequired ? 'AUTHENTICATION_REQUIRED' : 'PROBE_FAILED',
      reason: authRequired
        ? 'Sign in using the Antigravity CLI, then recheck availability.'
        : 'Antigravity availability must be rechecked.',
    };
    delete descriptor.compatibility;
  }

  function requireAuthentication(fingerprint: string) {
    if (authentication.isRejected(fingerprint)) {
      throw new SessionError(
        'PROVIDER_AUTH_REQUIRED',
        'Sign in using the Antigravity CLI, then recheck availability.',
      );
    }
  }

  function validateInit(init: AntigravityInit, questions = false) {
    const normalize = (path: string) => resolve(path).toLowerCase();
    // Require the APIs used by this adapter, rather than a tested binary/hash.
    // Additional tools do not disable a compatible update: the hook still
    // denies operations without explicitly supported handlers and schemas.
    const requiredTools = ['view_file', 'write_to_file', 'run_command'];
    if (questions) {
      requiredTools.push('call_mcp_tool');
    }

    if (
      normalize(init.cwd) !== normalize(options.workspace) ||
      init.permissionMode !== 'proceed-in-sandbox' ||
      !requiredTools.every((tool) => init.tools.includes(tool))
    ) {
      throw new AntigravityProtocolError();
    }
  }

  async function refresh(signal: AbortSignal): Promise<ProviderDescriptor> {
    discovery ??= (async () => {
      const bounded = AbortSignal.any([signal, AbortSignal.timeout(ProviderTimeouts.discoveryMs)]);
      let authenticationFingerprint: string | undefined;
      try {
        const installation = await inspect(bounded);
        authenticationFingerprint = installation.authenticationFingerprint;
        requireAuthentication(authenticationFingerprint);
        if (installation.fingerprint === checkedFingerprint && Date.now() - checkedAt < cacheMs) {
          authentication.verified(authenticationFingerprint);

          return structuredClone(descriptor);
        }

        const compatibility = classifyProviderInstallation({
          ...installation,
          providerId: 'antigravity',
        });
        if (compatibility.classification === 'unsupported') {
          throw new SessionError('PROVIDER_UNAVAILABLE', compatibility.reason);
        }

        // Discovery never rewrites another invocation's MCP or hook configuration.
        const temporary = await createInvocationScope(options.homeRoot, randomUUID());
        const profile = await prepareAntigravityProfile(installation, {
          home: temporary.directory,
        });
        let verified = false;
        let result: Awaited<ReturnType<typeof probeAntigravity>>;
        try {
          result = await probe({
            ...installation,
            temporaryRoot: options.temporaryRoot,
            environment: profile.environment,
            signal: bounded,
            selection: { providerId: 'antigravity', mode: 'workspace-write' },
          });
          verified = true;
        } finally {
          // If native ownership is uncertain, retain the private profile for diagnosis.
          await temporary.close(verified);
        }

        validateInit(result.initialization);
        const current = await inspect(bounded);
        if (
          current.fingerprint !== installation.fingerprint ||
          current.accountScope !== installation.accountScope
        ) {
          throw new SessionError('PROVIDER_UNAVAILABLE', 'Antigravity changed during discovery.');
        }

        requireAuthentication(current.authenticationFingerprint);
        const admission = admitProvider(compatibility, {
          configured: true,
          authenticated: true,
          protocolVerified: true,
          executionPolicyChecked: true,
          executionMode: 'workspace-write',
          managedEffectsAvailable: options.managedWrites,
        });
        descriptor = {
          ...descriptor,
          models: result.models,
          readiness: admission.allowed ? 'ready' : 'unavailable',
          defaultModeId: 'accept-edits',
          providerModes: antigravityModes.map((mode) => ({
            ...mode,
            readiness: admission.allowed ? 'ready' : 'unavailable',
            compatibility: compatibility.classification,
          })),
          compatibility: {
            classification: compatibility.classification,
            protocolProfile: 'antigravity-stream-json-v1',
          },
          ...(!admission.allowed ? { reason: 'Managed workspace execution is unavailable.' } : {}),
        };
        if (admission.allowed) {
          delete descriptor.reason;
          delete descriptor.reasonCode;
        }

        authentication.verified(current.authenticationFingerprint);
        checkedFingerprint = current.fingerprint;
        checkedAt = Date.now();
        scope = current.accountScope;
      } catch (error) {
        invalidate(error, authenticationFingerprint);
      }

      return structuredClone(descriptor);
    })();
    try {
      return await discovery;
    } finally {
      discovery = undefined;
    }
  }

  async function ready(signal: AbortSignal) {
    await refresh(signal);
    if (descriptor.readiness !== 'ready') {
      throw new SessionError(
        descriptor.readiness === 'authenticationRequired'
          ? 'PROVIDER_AUTH_REQUIRED'
          : 'PROVIDER_UNAVAILABLE',
        descriptor.reason ?? 'Antigravity is unavailable.',
      );
    }

    const installation = await inspect(signal);
    requireAuthentication(installation.authenticationFingerprint);
    if (installation.fingerprint !== checkedFingerprint || installation.accountScope !== scope) {
      invalidate();

      throw new SessionError('PROVIDER_UNAVAILABLE', 'Antigravity changed before invocation.');
    }

    authentication.verified(installation.authenticationFingerprint);

    return installation;
  }

  function validateSelection(selection: Invocation['selection']) {
    antigravityMode(selection);
    if (selection.providerId !== 'antigravity') {
      throw new SessionError('PROVIDER_UNAVAILABLE', 'Antigravity provider identity is required.');
    }

    if (
      selection.modelId &&
      !descriptor.models.some((model) => model.modelId === selection.modelId)
    ) {
      throw new SessionError('MODEL_UNSUPPORTED', 'Select an available Antigravity model.');
    }

    if (selection.effort) {
      throw new SessionError(
        'CAPABILITY_UNSUPPORTED',
        'Antigravity effort discovery is unavailable.',
      );
    }
  }

  return {
    telemetryGroups: ['usage'],
    nativeContextMode: 'provider-assigned',
    supportsManagedWrites: options.managedWrites === true,
    describe: () => structuredClone(descriptor),
    contextScope: () => scope,
    refresh,
    async validate(selection, signal = AbortSignal.timeout(ProviderTimeouts.discoveryMs)) {
      await ready(signal);
      validateSelection(selection);
    },
    start(invocation, emit, signal) {
      if (!invocation.beforeDispatch) {
        throw new SessionError(
          'SESSION_RECOVERY_REQUIRED',
          'Durable dispatch admission is required.',
        );
      }

      const execution = invocation.executionContext;
      if (
        execution.kind !== 'workspace-write' ||
        execution.workspace !== options.workspace ||
        !options.managedWrites ||
        execution.admission.operationId !== invocation.invocationId
      ) {
        throw new SessionError(
          'CAPABILITY_UNSUPPORTED',
          'Matching managed workspace execution authority is required.',
        );
      }

      let installation: AntigravityInstallation | undefined;
      let nativeSessionId: string | undefined;
      let nativeTools: readonly string[] = [];
      let dispatchAuthentication: string | undefined;
      async function revalidate(operationSignal: AbortSignal) {
        const current = await inspect(operationSignal);
        if (
          current.fingerprint !== installation?.fingerprint ||
          current.accountScope !== invocation.providerContext?.scope
        ) {
          throw new SessionError(
            'SESSION_RECOVERY_REQUIRED',
            'Antigravity account or installation changed before dispatch.',
          );
        }

        requireAuthentication(current.authenticationFingerprint);
        dispatchAuthentication = current.authenticationFingerprint;
        authentication.verified(dispatchAuthentication);
      }

      return createAntigravityOperation(
        invocation,
        async (fact) => {
          if (
            fact.kind === 'lost' ||
            (fact.kind === 'outcome' && fact.error?.code === 'PROVIDER_AUTH_REQUIRED')
          ) {
            invalidate(
              fact.kind === 'outcome'
                ? new SessionError('PROVIDER_AUTH_REQUIRED', 'Native authentication is required.')
                : undefined,
              dispatchAuthentication ?? installation?.authenticationFingerprint,
            );
          }

          await emit(fact);
        },
        signal,
        {
          async beforeDispatch(operationSignal) {
            await invocation.beforeDispatch?.();
            operationSignal.throwIfAborted();
            await revalidate(operationSignal);
          },
          async beforeInput(init, operationSignal) {
            validateInit(init, true);
            await revalidate(operationSignal);
            nativeSessionId = init.conversationId;
            nativeTools = Object.freeze([...init.tools]);
          },
          async launch(operationSignal) {
            installation = await ready(operationSignal);
            validateSelection(invocation.selection);
            if (installation.accountScope !== invocation.providerContext?.scope) {
              throw new SessionError(
                'SESSION_RECOVERY_REQUIRED',
                'Antigravity account changed after context admission.',
              );
            }

            const temporary = await createInvocationScope(
              // Hook credentials must not become files the provider can discover
              // through ordinary in-workspace file tools.
              options.homeRoot,
              invocation.invocationId,
            );
            let launched = false;
            try {
              const bridge = await createAntigravityQuestionBridge({
                invocation: {
                  sessionId: invocation.sessionId,
                  turnId: invocation.turnId,
                  invocationId: invocation.invocationId,
                },
                emit,
                signal: operationSignal,
                permissionContext: () =>
                  nativeSessionId
                    ? {
                        nativeSessionId,
                        nativeTools,
                        workspace: options.workspace,
                        writable: true,
                        // A canonical approval delegates to native proceed-in-sandbox.
                        // Runtime does not request sandbox bypass; enforcement is native.
                        commandsAllowed: true,
                      }
                    : undefined,
              });
              temporary.defer('listener', () => bridge.close());
              const configurationPath = await temporary.temporaryFile(
                'hook-client.json',
                JSON.stringify(bridge.nativeHookClientConfiguration),
              );
              const helper =
                dependencies.helper ??
                fileURLToPath(
                  import.meta.url.endsWith('.ts')
                    ? import.meta.resolve('@nevo/specflow-runtime/antigravity-hook')
                    : new URL('./antigravity-hook.js', import.meta.url),
                );
              const hooks = antigravityHooks({
                systemRoot: installation.host.SYSTEMROOT ?? installation.host.SystemRoot ?? '',
                node: process.execPath,
                helper,
              });
              const home = join(
                options.homeRoot,
                'account-' + digest(installation.accountScope),
                'session-' + digest(invocation.sessionId),
              );
              const profile = await prepareAntigravityProfile(installation, {
                home,
                mcp: bridge.configuration,
                permissionRule: bridge.permissionRule,
                hooks,
              });
              const environment = {
                values: {
                  ...profile.environment.values,
                  NEVO_ANTIGRAVITY_HOOK_CONFIG: configurationPath,
                },
                sources: {
                  ...profile.environment.sources,
                  NEVO_ANTIGRAVITY_HOOK_CONFIG: 'runtime' as const,
                },
              };
              const owner = await launch({
                invocationId: invocation.invocationId,
                scope: temporary,
                executable: installation.executable,
                args: antigravityArguments(invocation.selection, invocation.providerContext),
                cwd: options.workspace,
                environment,
                signal: operationSignal,
                maxFrameBytes: 1024 * 1024,
                secrets: [bridge.nativeHookClientConfiguration.token],
              });
              launched = true;

              return { owner, interactions: bridge };
            } finally {
              if (!launched) {
                await temporary.close();
              }
            }
          },
        },
      );
    },
  };
}
