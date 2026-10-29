import { resolve } from 'node:path';
import type { ProviderDescriptor } from '@nevo/specflow-contracts/sessions';
import { CodexRpcError, rpcObject, type createCodexRpc, type RpcMessage } from './rpc';
import { disabledCodexFeatures } from './installation';
import type { Invocation } from '../driver';
import { codexMode } from './modes';

export type CodexPeer = ReturnType<typeof createCodexRpc>;
export function codexMetadata(message: RpcMessage): boolean {
  // Warning prose is untrusted diagnostics. It cannot change policy or establish
  // an outcome; the effective settings and terminal protocol are checked separately.
  if (message.method === 'warning') {
    return (
      message.id === undefined &&
      typeof message.params.message === 'string' &&
      Buffer.byteLength(message.params.message) <= 8192 &&
      (message.params.threadId == null || typeof message.params.threadId === 'string')
    );
  }

  if (message.method === 'remoteControl/status/changed') {
    return message.id === undefined && message.params.status === 'disabled';
  }

  return (
    message.id === undefined &&
    (message.method.startsWith('codex/event/') ||
      [
        'account/updated',
        'account/rateLimits/updated',
        'skills/changed',
        'models/changed',
        'thread/started',
        'thread/status/changed',
        'thread/readState/changed',
        'thread/goal/cleared',
      ].includes(message.method))
  );
}

export async function initializeCodex(peer: CodexPeer, signal: AbortSignal, expectedHome: string) {
  const initialized = rpcObject(
    await peer.request(
      'initialize',
      {
        clientInfo: { name: 'nevo-specflow', title: 'Nevo SpecFlow', version: '0.1.0' },
        capabilities: { experimentalApi: true },
      },
      signal,
    ),
  );
  if (typeof initialized.userAgent !== 'string' || !initialized.userAgent) {
    throw new CodexRpcError('protocol');
  }

  if (
    typeof initialized.codexHome !== 'string' ||
    resolve(initialized.codexHome) !== resolve(expectedHome)
  ) {
    throw new CodexRpcError('protocol');
  }

  await peer.notify('initialized');
  const requirements = rpcObject(await peer.request('configRequirements/read', {}, signal));
  if (requirements.requirements !== null) {
    throw new CodexRpcError('protocol');
  }

  const features = new Map<string, boolean>();
  let cursor: string | undefined;
  for (let page = 0; page < 4; page++) {
    const result = rpcObject(
      await peer.request(
        'experimentalFeature/list',
        { limit: 100, ...(cursor ? { cursor } : {}) },
        signal,
      ),
    );
    if (!Array.isArray(result.data) || result.data.length > 100) {
      throw new CodexRpcError('protocol');
    }

    for (const raw of result.data) {
      const value = rpcObject(raw);
      if (typeof value.name !== 'string' || typeof value.enabled !== 'boolean') {
        throw new CodexRpcError('protocol');
      }

      features.set(value.name, value.enabled);
    }

    if (result.nextCursor == null) {
      cursor = undefined;
      break;
    }

    if (typeof result.nextCursor !== 'string' || result.nextCursor.length > 2048) {
      throw new CodexRpcError('protocol');
    }

    cursor = result.nextCursor;
  }

  if (
    cursor ||
    features.get('code_mode_host') !== true ||
    disabledCodexFeatures.some((name) => features.get(name) !== false)
  ) {
    throw new CodexRpcError('protocol');
  }

  const servers = rpcObject(await peer.request('mcpServerStatus/list', { limit: 100 }, signal));
  if (!Array.isArray(servers.data) || servers.data.length !== 0 || servers.nextCursor != null) {
    throw new CodexRpcError('protocol');
  }
}

export function codexThreadSettings(
  workspace: string,
  modelId?: string,
  selection?: Invocation['selection'],
) {
  const mode = codexMode(selection ?? { providerId: 'codex', mode: 'read-only' });

  return {
    cwd: workspace,
    sandbox: mode.sandbox,
    approvalPolicy: mode.approval,
    approvalsReviewer: 'user',
    ...(modelId ? { model: modelId } : {}),
  };
}

export function verifyCodexThread(
  value: unknown,
  workspace: string,
  expectedId?: string,
  selection?: Invocation['selection'],
  ephemeral = false,
): string {
  const mode = codexMode(selection ?? { providerId: 'codex', mode: 'read-only' });
  const response = rpcObject(value);
  const thread = rpcObject(response.thread);
  const sandbox = rpcObject(response.sandbox);
  if (
    typeof thread.id !== 'string' ||
    !/^[A-Za-z0-9_.:-]{1,128}$/.test(thread.id) ||
    (expectedId && thread.id !== expectedId) ||
    typeof response.cwd !== 'string' ||
    resolve(response.cwd) !== resolve(workspace) ||
    response.approvalPolicy !== mode.approval ||
    response.approvalsReviewer !== 'user' ||
    sandbox.type !== (mode.mode === 'workspace-write' ? 'workspaceWrite' : 'readOnly') ||
    sandbox.networkAccess !== false ||
    thread.ephemeral !== ephemeral ||
    (thread.turns !== undefined && (!Array.isArray(thread.turns) || thread.turns.length !== 0))
  ) {
    throw new CodexRpcError('protocol');
  }

  if (
    mode.mode === 'workspace-write' &&
    (!Array.isArray(sandbox.writableRoots) ||
      sandbox.writableRoots.length > 1 ||
      sandbox.writableRoots.some(
        (path) => typeof path !== 'string' || resolve(path) !== resolve(workspace),
      ) ||
      sandbox.excludeTmpdirEnvVar !== true ||
      sandbox.excludeSlashTmp !== true)
  ) {
    throw new CodexRpcError('protocol');
  }

  return thread.id;
}

export async function codexModels(
  peer: CodexPeer,
  signal: AbortSignal,
): Promise<ProviderDescriptor['models']> {
  const models: ProviderDescriptor['models'] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 4; page++) {
    const result = rpcObject(
      await peer.request(
        'model/list',
        { limit: 32, includeHidden: false, ...(cursor ? { cursor } : {}) },
        signal,
      ),
    );
    if (!Array.isArray(result.data) || result.data.length > 32) {
      throw new CodexRpcError('protocol');
    }

    for (const raw of result.data) {
      const model = rpcObject(raw);
      if (model.hidden === true) {
        continue;
      }

      if (
        models.length >= 64 ||
        typeof model.model !== 'string' ||
        !model.model ||
        Buffer.byteLength(model.model) > 256 ||
        typeof model.displayName !== 'string' ||
        !model.displayName ||
        Buffer.byteLength(model.displayName) > 256 ||
        !Array.isArray(model.supportedReasoningEfforts) ||
        model.supportedReasoningEfforts.length > 16
      ) {
        throw new CodexRpcError('protocol');
      }

      const efforts = model.supportedReasoningEfforts.map((value) => {
        const effort = rpcObject(value).reasoningEffort;
        if (typeof effort !== 'string' || !effort || Buffer.byteLength(effort) > 64) {
          throw new CodexRpcError('protocol');
        }

        return effort;
      });
      const descriptor = { modelId: model.model, title: model.displayName, efforts };
      if (model.isDefault === true) {
        models.unshift(descriptor);
      } else {
        models.push(descriptor);
      }
    }

    if (result.nextCursor == null) {
      cursor = undefined;
      break;
    }

    if (typeof result.nextCursor !== 'string' || result.nextCursor.length > 2048) {
      throw new CodexRpcError('protocol');
    }

    cursor = result.nextCursor;
  }

  if (
    cursor ||
    !models.length ||
    new Set(models.map((model) => model.modelId)).size !== models.length
  ) {
    throw new CodexRpcError('protocol');
  }

  return models;
}
