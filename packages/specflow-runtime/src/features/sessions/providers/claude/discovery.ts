import type { ProviderDescriptor } from '@nevo/specflow-contracts/sessions';
import { resolve } from 'node:path';
import type { Invocation } from '../driver';
import { object, ClaudeProtocolError } from './protocol';
const readTools = ['Read', 'Glob', 'Grep', 'AskUserQuestion'];

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
    readTools.join(','),
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
  if (!Array.isArray(payload.models) || payload.models.length > 64) throw new ClaudeProtocolError();
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
      efforts.length > 16 ||
      efforts.some(
        (value) => typeof value !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(value),
      )
    )
      throw new ClaudeProtocolError();
    return { modelId: model.value, title: model.displayName, efforts: efforts as string[] };
  });
  if (new Set(models.map((model) => model.modelId)).size !== models.length)
    throw new ClaudeProtocolError();
  return models;
}
export function verifyClaudeInit(
  frame: Record<string, unknown>,
  workspace: string,
  expectedVersion?: string,
) {
  const tools = frame.tools;
  if (
    frame.type !== 'system' ||
    frame.subtype !== 'init' ||
    (expectedVersion !== undefined && claudeVersion(frame) !== expectedVersion) ||
    typeof frame.cwd !== 'string' ||
    resolve(frame.cwd) !== resolve(workspace) ||
    frame.permissionMode !== 'plan' ||
    !Array.isArray(tools) ||
    readTools.some((tool) => !tools.includes(tool)) ||
    tools.some(
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

/** Missing/non-version diagnostic text must not become a fabricated version or leak native prose. */
export function claudeVersion(payload: Record<string, unknown>): string | undefined {
  const value = payload.claude_code_version;
  return typeof value === 'string' &&
    /^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(value) &&
    value.length <= 128
    ? value
    : undefined;
}
