import type { ProviderDescriptor } from '@nevo/specflow-contracts/sessions';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { SessionError } from '../../errors';
import type { SessionDriver, Invocation } from '../driver';
import {
  createInvocationScope,
  launchOwnedProcess,
  projectProviderEnvironment,
  type ProviderEnvironment,
} from '../process';
import { createClaudeOperation } from './operation';
import { inspectClaudeInstallation, claudeCertification } from './installation';
import { object, ClaudeProtocolError } from './protocol';

export function claudeArguments(
  selection?: Invocation['selection'],
  context?: Invocation['providerContext'],
): string[] {
  return [
    '--print',
    '--verbose',
    '--input-format',
    'stream-json',
    '--output-format',
    'stream-json',
    '--safe-mode',
    '--restricted',
    '--tools',
    'Read,Glob,Grep,AskUserQuestion',
    '--permission-mode',
    'plan',
    '--permission-prompts',
    'host',
    '--permission-prompt-tool',
    'stdio',
    '--strict-mcp-config',
    '--mcp-config',
    '{"mcpServers":{}}',
    '--setting-sources',
    '',
    '--settings',
    '{"disableAllHooks":true}',
    '--disable-slash-commands',
    '--no-chrome',
    ...(context ? [context.resume ? '--resume' : '--session-id', context.nativeSessionId] : []),
    ...(selection?.modelId ? ['--model', selection.modelId] : []),
    ...(selection?.effort ? ['--effort', selection.effort] : []),
  ];
}
export function claudeModels(payload: Record<string, unknown>): ProviderDescriptor['models'] {
  if (
    payload.claude_code_version !== claudeCertification.version ||
    !Array.isArray(payload.models) ||
    payload.models.length > 64
  )
    throw new ClaudeProtocolError();
  const models = payload.models.map((entry) => {
    const model = object(entry);
    if (
      typeof model.value !== 'string' ||
      !/^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,255}$/.test(model.value) ||
      typeof model.displayName !== 'string' ||
      !model.displayName ||
      Buffer.byteLength(model.displayName) > 256
    )
      throw new ClaudeProtocolError();
    const efforts = model.supportsEffort === true ? model.supportedEffortLevels : [];
    if (
      !Array.isArray(efforts) ||
      efforts.length > 5 ||
      efforts.some(
        (value) =>
          typeof value !== 'string' || !['low', 'medium', 'high', 'xhigh', 'max'].includes(value),
      )
    )
      throw new ClaudeProtocolError();
    return { modelId: model.value, title: model.displayName, efforts: efforts as string[] };
  });
  if (new Set(models.map((model) => model.modelId)).size !== models.length)
    throw new ClaudeProtocolError();
  return models;
}
export function verifyClaudeInit(frame: Record<string, unknown>, workspace: string) {
  if (
    frame.type !== 'system' ||
    frame.subtype !== 'init' ||
    frame.claude_code_version !== claudeCertification.version ||
    typeof frame.cwd !== 'string' ||
    resolve(frame.cwd) !== resolve(workspace) ||
    frame.permissionMode !== 'plan' ||
    !Array.isArray(frame.tools) ||
    frame.tools.some(
      (tool) =>
        typeof tool !== 'string' ||
        !['Read', 'Glob', 'Grep', 'AskUserQuestion', 'EndConversation'].includes(tool),
    ) ||
    !Array.isArray(frame.mcp_servers) ||
    frame.mcp_servers.length !== 0 ||
    (frame.plugins !== undefined &&
      (!Array.isArray(frame.plugins) ||
        frame.plugins.some((value) => {
          const plugin = object(value);
          return (
            !['cc-plugin-agents-md', 'cc-plugin-telemetry', 'cc-plugin-plugin-authoring'].includes(
              String(plugin.name),
            ) ||
            plugin.path !== 'builtin' ||
            plugin.source !== String(plugin.name) + '@builtin'
          );
        })))
  )
    throw new ClaudeProtocolError();
}
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
          models = claudeModels(object(response.response));
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
      const installation = await inspect(signal);
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
      return createClaudeOperation(invocation, emit, signal, {
        async launch(operationSignal) {
          const installation = await inspect(operationSignal);
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
          claudeModels(payload);
        },
        verifyFrame(frame) {
          if (!verified) {
            verifyClaudeInit(frame, options.workspace);
            verified = true;
          } else if (frame.type === 'system' && frame.subtype === 'init')
            verifyClaudeInit(frame, options.workspace);
        },
      });
    },
  };
}
