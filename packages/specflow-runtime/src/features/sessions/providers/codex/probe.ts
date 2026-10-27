import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { SessionError } from '../../errors';
import { createInvocationScope, launchOwnedProcess } from '../process';
import type { inspectCodexInstallation } from './installation';
import { codexArguments } from './installation';
import { createCodexRpc, CodexRpcError, rpcObject } from './rpc';
import {
  initializeCodex,
  codexMetadata,
  codexModels,
  codexThreadSettings,
  verifyCodexThread,
  type CodexPeer,
} from './connection';
import { probeCodexBoundary } from './boundary';
import { codexModes } from './modes';

async function closeProbe(peer: CodexPeer) {
  if ((await peer.close()).process.state !== 'stopped')
    throw new SessionError('PROVIDER_UNAVAILABLE', 'Codex probe process settlement is unknown.');
}

async function executionBoundary(
  options: Awaited<ReturnType<typeof inspectCodexInstallation>> & { signal: AbortSignal },
) {
  const invocationId = randomUUID();
  const scope = await createInvocationScope(join(options.home, 'probe-temporary'), invocationId);
  const workspace = join(scope.directory, 'boundary');
  await mkdir(workspace);
  const owner = await launchOwnedProcess({
    ...options,
    invocationId,
    scope,
    cwd: workspace,
    args: codexArguments(workspace, false, { providerId: 'codex', mode: 'workspace-write' }),
  });
  const peer = createCodexRpc(owner, (message) => {
    if (!codexMetadata(message)) throw new CodexRpcError('protocol');
    return Promise.resolve();
  });
  try {
    await initializeCodex(peer, options.signal, options.home);
    // The positive and readonly-negative targets are inside this process's SAME
    // implicit workspace. Ignoring a readonly override would make that test fail.
    // The writer-negative sibling is outside both the implicit and explicit roots.
    return await probeCodexBoundary(peer, scope.directory, options.signal);
  } finally {
    await closeProbe(peer);
  }
}

export async function probeCodex(
  options: Awaited<ReturnType<typeof inspectCodexInstallation>> & {
    workspace: string;
    temporaryRoot: string;
    signal: AbortSignal;
  },
) {
  const invocationId = randomUUID();
  const scope = await createInvocationScope(options.temporaryRoot, invocationId);
  const owner = await launchOwnedProcess({
    ...options,
    scope,
    invocationId,
    cwd: options.workspace,
    args: codexArguments(options.workspace),
  });
  const peer = createCodexRpc(owner, (message) => {
    if (!codexMetadata(message)) throw new CodexRpcError('protocol');
    return Promise.resolve();
  });
  try {
    await initializeCodex(peer, options.signal, options.home);
    const account = rpcObject(
      await peer.request('account/read', { refreshToken: false }, options.signal),
    );
    if (account.account == null || rpcObject(account.account).type !== 'chatgpt')
      throw new SessionError(
        'PROVIDER_AUTH_REQUIRED',
        'Codex requires an active ChatGPT CLI login.',
      );
    const models = await codexModels(peer, options.signal);
    const catalogue = rpcObject(await peer.request('collaborationMode/list', {}, options.signal));
    if (!Array.isArray(catalogue.data) || catalogue.data.length > 16)
      throw new CodexRpcError('protocol');
    const advertisedModes = catalogue.data.map((raw) => {
      const mode = rpcObject(raw);
      if (typeof mode.mode !== 'string' || mode.mode.length > 128)
        throw new CodexRpcError('protocol');
      return mode.mode;
    });
    if (new Set(advertisedModes).size !== advertisedModes.length)
      throw new CodexRpcError('protocol');
    const modes: string[] = [];
    for (const mode of codexModes) {
      if (!advertisedModes.includes(mode.nativeMode)) continue;
      const selection = { providerId: 'codex', providerModeId: mode.modeId, mode: mode.mode };
      try {
        const response = await peer.request(
          'thread/start',
          {
            ...codexThreadSettings(options.workspace, undefined, selection),
            ephemeral: true,
            experimentalRawEvents: false,
            dynamicTools: [],
          },
          options.signal,
        );
        verifyCodexThread(response, options.workspace, undefined, selection, true);
        modes.push(mode.nativeMode);
      } catch {
        /* A failed mode does not certify it or silently substitute another. */
      }
    }
    const limits = rpcObject(await peer.request('account/rateLimits/read', {}, options.signal));
    if (limits.ordinaryUsageAllowed === false)
      throw new SessionError(
        'PROVIDER_UNAVAILABLE',
        'Codex account usage is currently unavailable.',
      );
    const boundary = await executionBoundary(options);
    return { models, modes, boundary };
  } finally {
    await closeProbe(peer);
  }
}
