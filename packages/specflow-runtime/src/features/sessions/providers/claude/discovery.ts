import type { ProviderDescriptor } from '@nevo/specflow-contracts/sessions';
import { resolve } from 'node:path';
import type { Invocation } from '../driver';
import { object, ClaudeProtocolError, shown } from './protocol';
import { partitionAgentPermissionRules } from '@nevo/specflow-contracts/documents';
import { claudeMode, toolsForClaudeMode, type ClaudeMode } from './modes';

/**
 * The `--settings` of a Turn. Setting sources are off (`--setting-sources ''`), so no owner or
 * project permission is ever merged. Bash always asks: `ask` outranks `allow`, and an allowlisted
 * product CLI command is approved by the host instead (see `createClaudeOperation`). Only the scoped
 * read-tool rules of an agent step execution Turn become native `allow` rules.
 */
export function claudeSettings(permissions?: { readonly allow: readonly string[] }): string {
  const allow = (
    permissions ? partitionAgentPermissionRules(permissions.allow).accepted : []
  ).filter((rule) => !rule.startsWith('Bash('));

  return JSON.stringify({
    disableAllHooks: true,
    permissions: { ...(allow.length > 0 ? { allow } : {}), ask: ['Bash'] },
    env: { CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR: '1' },
  });
}

export function claudeArguments(
  selection?: Invocation['selection'],
  context?: Invocation['providerContext'],
  permissions?: Invocation['permissions'],
): string[] {
  const mode = claudeMode(selection);

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
    toolsForClaudeMode(mode).join(','),
    '--permission-mode',
    mode.modeId,
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
    claudeSettings(permissions),
    '--disable-slash-commands',
    '--no-chrome',
    ...(context ? [context.resume ? '--resume' : '--session-id', context.nativeSessionId] : []),
    ...(selection?.modelId ? ['--model', selection.modelId] : []),
    ...(selection?.effort ? ['--effort', selection.effort] : []),
  ];
}

/**
 * The models of a native mode. For `auto`, when Claude reports `supportsAutoMode` (2.1.312), only
 * the models it marks: Claude would run any other model in `default` instead, so the choice is
 * refused before dispatch. A Claude that reports the field for no model keeps every model; a
 * fallback there is still refused by its `system/status` frame (`verifyClaudeStatus`).
 */
export function claudeModels(
  payload: Record<string, unknown>,
  modeId?: ClaudeMode['modeId'],
): ProviderDescriptor['models'] {
  if (!Array.isArray(payload.models) || payload.models.length > 64) {
    throw new ClaudeProtocolError();
  }

  const reported = payload.models.some((entry) => 'supportsAutoMode' in object(entry));
  const entries = payload.models.filter(
    (entry) => modeId !== 'auto' || !reported || object(entry).supportsAutoMode === true,
  );
  const models = entries.map((entry) => {
    const model = object(entry);
    if (
      typeof model.value !== 'string' ||
      !/^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,255}$/.test(model.value) ||
      typeof model.displayName !== 'string' ||
      !model.displayName ||
      Buffer.byteLength(model.displayName) > 256
    ) {
      throw new ClaudeProtocolError();
    }

    const efforts = model.supportsEffort === true ? model.supportedEffortLevels : [];
    if (
      !Array.isArray(efforts) ||
      efforts.length > 16 ||
      efforts.some(
        (value) => typeof value !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(value),
      )
    ) {
      throw new ClaudeProtocolError();
    }

    const resolved =
      typeof model.resolvedModel === 'string' &&
      model.resolvedModel !== model.value &&
      /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,255}$/.test(model.resolvedModel)
        ? model.resolvedModel
        : undefined;

    return {
      modelId: model.value,
      title: model.displayName,
      efforts: efforts as string[],
      ...(resolved ? { resolvedModelId: resolved } : {}),
    };
  });
  if (new Set(models.map((model) => model.modelId)).size !== models.length) {
    throw new ClaudeProtocolError();
  }

  return models;
}

/**
 * A launch the restricted profile refuses, naming the field that failed. Still a protocol error (the
 * process is stopped and the Turn is lost as rejected); its message becomes the provider's reason.
 */
export class ClaudeRestrictionError extends ClaudeProtocolError {
  constructor(reason: string) {
    super(reason);
    this.name = 'ClaudeRestrictionError';
    this.message = reason;
  }
}

const builtinPlugins = ['cc-plugin-agents-md', 'cc-plugin-telemetry', 'cc-plugin-plugin-authoring'];

/**
 * Claude reports the permission mode it applies in `system/status`, also before `system/init`. It
 * falls back silently to another mode (2.1.312: `default` for a model without auto mode); a Turn
 * never runs in a mode other than the admitted one.
 */
export function verifyClaudeStatus(
  frame: Record<string, unknown>,
  selection?: Invocation['selection'],
  version = 'of an unknown version',
) {
  const mode = claudeMode(selection);
  if (frame.permissionMode !== undefined && frame.permissionMode !== mode.nativeMode) {
    throw new ClaudeRestrictionError(
      `Claude ${version} switched to permission mode ${shown(frame.permissionMode)} instead of ${mode.nativeMode}.`,
    );
  }
}

export function verifyClaudeInit(
  frame: Record<string, unknown>,
  workspace: string,
  expectedVersion?: string,
  selection?: Invocation['selection'],
) {
  const mode = claudeMode(selection);
  const requiredTools = toolsForClaudeMode(mode);
  const version = claudeVersion(frame) ?? 'of an unknown version';
  if (frame.type !== 'system' || frame.subtype !== 'init') {
    throw new ClaudeRestrictionError(
      `Claude ${version} sent ${shown(frame.type)} output before its system/init frame.`,
    );
  }

  if (expectedVersion !== undefined && claudeVersion(frame) !== expectedVersion) {
    throw new ClaudeRestrictionError(
      `Claude reported version ${version} at init but ${expectedVersion} at initialize.`,
    );
  }

  if (typeof frame.cwd !== 'string' || resolve(frame.cwd) !== resolve(workspace)) {
    throw new ClaudeRestrictionError(
      `Claude ${version} started in another working directory than the Turn's workspace.`,
    );
  }

  if (frame.permissionMode !== mode.nativeMode) {
    throw new ClaudeRestrictionError(
      `Claude ${version} started in permission mode ${shown(frame.permissionMode)} instead of ${mode.nativeMode}.`,
    );
  }

  const tools: unknown[] = Array.isArray(frame.tools) ? frame.tools : [];
  const missing = requiredTools.filter((tool) => !tools.includes(tool));
  const extra = tools.filter(
    (tool) => typeof tool !== 'string' || ![...requiredTools, 'EndConversation'].includes(tool),
  );
  if (!Array.isArray(frame.tools) || missing.length || extra.length) {
    throw new ClaudeRestrictionError(
      `Claude ${version} reported other tools than the restricted set` +
        (missing.length ? `; missing ${missing.join(', ')}` : '') +
        (extra.length ? `; not allowed ${extra.slice(0, 8).map(shown).join(', ')}` : '') +
        '.',
    );
  }

  if (!Array.isArray(frame.mcp_servers) || frame.mcp_servers.length !== 0) {
    throw new ClaudeRestrictionError(
      `Claude ${version} reported MCP servers, but the restricted profile allows none.`,
    );
  }

  if (frame.plugins === undefined) {
    return;
  }

  if (!Array.isArray(frame.plugins)) {
    throw new ClaudeRestrictionError(`Claude ${version} reported its plugins in an unknown form.`);
  }

  for (const value of frame.plugins as unknown[]) {
    const plugin = object(value);
    if (
      !builtinPlugins.includes(String(plugin.name)) ||
      plugin.path !== 'builtin' ||
      plugin.source !== String(plugin.name) + '@builtin'
    ) {
      throw new ClaudeRestrictionError(
        `Claude ${version} loaded the plugin ${shown(plugin.name)}, which is not allowed.`,
      );
    }
  }
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
