import { createHash, randomUUID } from 'node:crypto';
import type { TelemetryLimitWindow } from '@nevo/specflow-contracts/sessions';
import { createInvocationScope, launchOwnedProcess } from '../process';
import { validateDriverFact } from '../facts';
import { SessionError } from '../../errors';
import { codexArguments, type inspectCodexInstallation } from './installation';
import { codexMetadata, initializeCodex } from './connection';
import { createCodexRpc, CodexRpcError, rpcObject } from './rpc';
import { nativeDecimal } from '../decimal';

/** Percentages use a documented 10^-12 percentage-point resolution, rounding
 * upward so quantization cannot understate used quota or turn tiny usage into 0. */
function percentage(value: number): string {
  const [whole, fraction = ''] = nativeDecimal(value).split('.');
  if (fraction.length <= 12) {
    return nativeDecimal(value);
  }

  const units =
    BigInt(whole! + fraction.slice(0, 12)) + (/[1-9]/.test(fraction.slice(12)) ? 1n : 0n);
  const digits = units.toString().padStart(13, '0');

  return digits.slice(0, -12) + '.' + digits.slice(-12);
}

/** Native account/rateLimits/read reports percentage windows, not token budgets.
 * Bucket labels/identities remain private; opaque hashes identify stable windows. */
export function codexLimitWindows(value: unknown): TelemetryLimitWindow[] {
  const response = rpcObject(value);
  const byId =
    response.rateLimitsByLimitId == null ? undefined : rpcObject(response.rateLimitsByLimitId);
  const buckets = byId ? Object.entries(byId) : ([['codex', response.rateLimits]] as const);
  if (buckets.length > 8) {
    throw new CodexRpcError('capacity');
  }

  const windows: TelemetryLimitWindow[] = [];
  for (const [id, raw] of buckets) {
    if (raw == null) {
      continue;
    }

    if (!id || Buffer.byteLength(id) > 256) {
      throw new CodexRpcError('protocol');
    }

    const bucket = rpcObject(raw);
    for (const name of ['primary', 'secondary'] as const) {
      if (bucket[name] == null) {
        continue;
      }

      const native = rpcObject(bucket[name]);
      if (
        typeof native.usedPercent !== 'number' ||
        !Number.isFinite(native.usedPercent) ||
        native.usedPercent < 0 ||
        native.usedPercent > 100
      ) {
        throw new CodexRpcError('protocol');
      }

      const window: TelemetryLimitWindow = {
        windowId: createHash('sha256')
          .update(JSON.stringify([id, name]))
          .digest('hex'),
        scope: 'account',
        unit: 'percent',
        used: percentage(native.usedPercent),
      };
      if (native.windowDurationMins != null) {
        if (
          typeof native.windowDurationMins !== 'number' ||
          !Number.isSafeInteger(native.windowDurationMins) ||
          native.windowDurationMins < 1 ||
          !Number.isSafeInteger(native.windowDurationMins * 60)
        ) {
          throw new CodexRpcError('protocol');
        }

        window.windowSeconds = native.windowDurationMins * 60;
      }

      if (native.resetsAt != null) {
        if (
          typeof native.resetsAt !== 'number' ||
          !Number.isSafeInteger(native.resetsAt) ||
          native.resetsAt < 0 ||
          native.resetsAt > 253402300799
        ) {
          throw new CodexRpcError('protocol');
        }

        window.resetsAt = new Date(native.resetsAt * 1000).toISOString();
      }

      windows.push(window);
    }
  }

  if (!windows.length) {
    throw new SessionError('CAPABILITY_UNSUPPORTED', 'Codex account limits were not reported.');
  }

  validateDriverFact({
    kind: 'measurement',
    metric: 'limits',
    sampleId: 'validation',
    value: { windows },
  });

  return windows;
}

/** Separate bounded app-server account read. Never creates or resumes a thread. */
export async function readCodexLimits(
  options: Awaited<ReturnType<typeof inspectCodexInstallation>> & {
    workspace: string;
    temporaryRoot: string;
    signal: AbortSignal;
  },
  launch: (
    options: Parameters<typeof launchOwnedProcess>[0],
  ) => Promise<Parameters<typeof createCodexRpc>[0]> = launchOwnedProcess,
) {
  const invocationId = randomUUID();
  const scope = await createInvocationScope(options.temporaryRoot, invocationId);
  const owner = await launch({
    ...options,
    invocationId,
    scope,
    cwd: options.workspace,
    args: codexArguments(options.workspace),
  });
  const peer = createCodexRpc(owner, (message) => {
    if (!codexMetadata(message)) {
      throw new CodexRpcError('protocol');
    }

    return Promise.resolve();
  });
  async function close() {
    if ((await peer.close()).process.state !== 'stopped') {
      throw new SessionError(
        'PROVIDER_UNAVAILABLE',
        'Codex account read process settlement is unknown.',
      );
    }
  }

  try {
    await initializeCodex(peer, options.signal, options.home);
    const account = rpcObject(
      await peer.request('account/read', { refreshToken: false }, options.signal),
    );
    if (rpcObject(account.account).type !== 'chatgpt') {
      throw new SessionError(
        'PROVIDER_AUTH_REQUIRED',
        'Codex account limits require ChatGPT authentication.',
      );
    }

    return codexLimitWindows(await peer.request('account/rateLimits/read', {}, options.signal));
  } finally {
    await close();
  }
}
