import type { ProviderDescriptor } from '@nevo/specflow-contracts/sessions';
import { randomUUID } from 'node:crypto';
import { SessionError } from '../../errors';
import type { SessionDriver } from '../driver';
import {
  createInvocationScope,
  launchOwnedProcess,
  projectProviderEnvironment,
  type ProviderEnvironment,
} from '../process';
import { createClaudeOperation } from './operation';
import { inspectClaudeInstallation } from './installation';
import { object, ClaudeProtocolError } from './protocol';
import { claudeArguments, claudeModels, verifyClaudeInit } from './discovery';

export function createClaudeDriver(options: {
  workspace: string;
  temporaryRoot: string;
  executable?: string;
  environment?: ProviderEnvironment;
}): SessionDriver {
  const environment = options.environment ?? projectProviderEnvironment({ host: process.env });
  let descriptor: ProviderDescriptor = {
    providerId: 'claude',
    title: 'Claude Code',
    readiness: 'unknown',
    capabilities: {
      questions: true,
      permissions: false,
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
  const inspect = (signal: AbortSignal) =>
    inspectClaudeInstallation({ ...options, environment, signal });
  function invalidate(error?: unknown) {
    checkedAt = 0;
    scope = '';
    descriptor = {
      ...descriptor,
      readiness:
        error instanceof SessionError && error.code === 'PROVIDER_AUTH_REQUIRED'
          ? 'authenticationRequired'
          : 'unavailable',
      reason:
        error instanceof SessionError
          ? error.message
          : 'Claude operation availability must be rechecked.',
    };
  }
  async function refresh(signal: AbortSignal): Promise<ProviderDescriptor> {
    if (Date.now() - checkedAt < 30000) return structuredClone(descriptor);
    discovery ??= (async () => {
      let owner: Awaited<ReturnType<typeof launchOwnedProcess>> | undefined;
      try {
        const installation = await inspect(signal);
        const invocationId = randomUUID();
        const temporary = await createInvocationScope(options.temporaryRoot, invocationId);
        owner = await launchOwnedProcess({
          invocationId,
          scope: temporary,
          executable: installation.executable,
          cwd: options.workspace,
          args: claudeArguments(),
          environment,
          signal,
          secrets: installation.secrets,
        });
        const requestId = randomUUID();
        await owner.write(
          JSON.stringify({
            type: 'control_request',
            request_id: requestId,
            request: { subtype: 'initialize' },
          }) + '\n',
        );
        let models: ProviderDescriptor['models'] | undefined;
        for await (const line of owner.lines()) {
          const frame = object(JSON.parse(line));
          if (frame.type !== 'control_response') throw new ClaudeProtocolError();
          const response = object(frame.response);
          if (response.subtype !== 'success' || response.request_id !== requestId)
            throw new ClaudeProtocolError();
          models = claudeModels(object(response.response), installation.version);
          break;
        }
        if (!models?.length || (await owner.dispose()).process.state !== 'stopped')
          throw new ClaudeProtocolError();
        descriptor = { ...descriptor, models, readiness: 'ready' };
        delete descriptor.reason;
        scope = installation.accountScope;
      } catch (error) {
        descriptor = {
          ...descriptor,
          models: [],
          readiness:
            error instanceof SessionError && error.code === 'PROVIDER_AUTH_REQUIRED'
              ? 'authenticationRequired'
              : 'unavailable',
          reason:
            error instanceof SessionError
              ? error.message
              : 'Claude initialization could not be verified.',
        };
        scope = '';
      } finally {
        await owner?.dispose();
        checkedAt = Date.now();
      }
      return structuredClone(descriptor);
    })();
    try {
      return await discovery;
    } finally {
      discovery = undefined;
    }
  }
  return {
    describe: () => structuredClone(descriptor),
    refresh,
    contextScope: () => scope,
    async validate(selection, signal = AbortSignal.timeout(10000)) {
      if (selection.providerId !== 'claude')
        throw new SessionError('PROVIDER_UNAVAILABLE', 'Claude provider identity is required.');
      if (selection.mode !== 'read-only')
        throw new SessionError(
          'CAPABILITY_UNSUPPORTED',
          'Claude writable dispatch requires Engine effect admission.',
        );
      await refresh(signal);
      const installation = await inspect(signal).catch((error: unknown) => {
        invalidate(error);
        throw error;
      });
      if (descriptor.readiness !== 'ready' || installation.accountScope !== scope) {
        checkedAt = 0;
        throw new SessionError(
          'PROVIDER_UNAVAILABLE',
          'Claude discovery must be refreshed for the active installation and account.',
        );
      }
      const model = descriptor.models.find(
        (model) => model.modelId === (selection.modelId ?? 'default'),
      );
      if (!model)
        throw new SessionError('MODEL_UNSUPPORTED', 'Requested Claude model is unavailable.');
      if (selection.effort && !model.efforts.includes(selection.effort))
        throw new SessionError(
          'CAPABILITY_UNSUPPORTED',
          'Requested Claude effort is unavailable for this model.',
        );
    },
    start(invocation, emit, signal) {
      if (
        invocation.executionContext.kind !== 'read-only' ||
        invocation.executionContext.workspace !== options.workspace
      )
        throw new SessionError(
          'CAPABILITY_UNSUPPORTED',
          'Verified read-only workspace is required.',
        );
      let verified = false;
      let expectedVersion = '';
      return createClaudeOperation(
        invocation,
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
          )
            invalidate(
              fact.kind === 'outcome' && fact.error?.code === 'PROVIDER_AUTH_REQUIRED'
                ? new SessionError('PROVIDER_AUTH_REQUIRED', fact.error.message)
                : undefined,
            );
          await emit(fact);
        },
        signal,
        {
          async launch(operationSignal) {
            const installation = await inspect(operationSignal);
            expectedVersion = installation.version;
            if (installation.accountScope !== invocation.providerContext?.scope)
              throw new SessionError(
                'SESSION_RECOVERY_REQUIRED',
                'Claude account changed after native context admission.',
              );
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
          initialize(payload) {
            claudeModels(payload, expectedVersion);
          },
          verifyFrame(frame) {
            if (!verified) {
              verifyClaudeInit(frame, options.workspace, expectedVersion);
              verified = true;
            } else if (frame.type === 'system' && frame.subtype === 'init')
              verifyClaudeInit(frame, options.workspace, expectedVersion);
          },
        },
      );
    },
  };
}
