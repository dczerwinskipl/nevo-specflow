import { createHash } from 'node:crypto';
import { isAbsolute, relative, resolve } from 'node:path';
import type { DriverFact } from '../../persistence/protocol';
import type { EmitFact } from '../driver';
import { CodexRpcError, rpcObject, type RpcMessage } from './rpc';

function identifier(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_.:-]{1,128}$/.test(value)) {
    throw new CodexRpcError('protocol');
  }

  return value;
}

function textValue(value: unknown): string {
  if (typeof value !== 'string' || Buffer.byteLength(value) > 1024 * 1024) {
    throw new CodexRpcError('protocol');
  }

  return value;
}

/** Completed native items are authoritative, not reconstructed delta concatenations.
 * A single bounded pending answer preserves final/commentary separation for older
 * items without phase metadata. Native item identities, never text equality, dedupe.
 */
export function createCodexProtocol(
  emit: EmitFact,
  threadId: string,
  freshContext = false,
  workspace?: string,
  writable = false,
  telemetryContext?: { turnId: string; modelId: string },
) {
  identifier(threadId);
  const active = new Map<string, string>();
  const patches = new Map<string, { targets: string[]; hash: string }>();
  const seen = new Map<string, string>();
  let turnId: string | undefined;
  let terminal = false;
  let pending: { id: string; text: string; final: boolean } | undefined;
  let usageOrdinal = 0;
  let lastUsageHash = '';
  let usageBaseline = false;
  async function text(
    key: string,
    channel: Extract<DriverFact, { kind: 'text' }>['channel'],
    value: string,
  ) {
    const bytes = Buffer.from(value);
    for (let offset = 0; offset < bytes.length;) {
      let end = Math.min(offset + 16384, bytes.length);
      while (end < bytes.length && (bytes[end]! & 0xc0) === 0x80) {
        end--;
      }

      await emit({
        kind: 'text',
        key,
        channel,
        text: bytes.subarray(offset, end).toString('utf8'),
      });
      offset = end;
    }
  }

  async function commentary() {
    if (!pending) {
      return;
    }

    await text('commentary:' + pending.id, 'commentary', pending.text);
    pending = undefined;
  }

  function duplicate(key: string, value: unknown): boolean {
    const hash = createHash('sha256').update(JSON.stringify(value)).digest('hex');
    const previous = seen.get(key);
    if (previous !== undefined) {
      if (previous !== hash) {
        throw new CodexRpcError('protocol');
      }

      return true;
    }

    if (seen.size >= 4096) {
      throw new CodexRpcError('capacity');
    }

    seen.set(key, hash);

    return false;
  }

  const metadata = new Set([
    'thread/status/changed',
    'turn/plan/updated',
    'turn/diff/updated',
    'turn/moderationMetadata',
    'item/reasoning/summaryPartAdded',
    'item/plan/delta',
  ]);

  return {
    get turnId() {
      return turnId;
    },
    get terminal() {
      return terminal;
    },
    patchTargets(id: string) {
      return patches.get(id)?.targets.slice();
    },
    bindTurn(value: unknown) {
      const next = identifier(value);
      if (turnId && turnId !== next) {
        throw new CodexRpcError('protocol');
      }

      turnId = next;
    },
    async accept(message: RpcMessage) {
      if (terminal) {
        return;
      }

      const { method, params } = message;
      if (params.threadId !== threadId) {
        throw new CodexRpcError('protocol');
      }

      if (method === 'turn/started') {
        const turn = rpcObject(params.turn);
        const next = identifier(turn.id);
        if (turnId && turnId !== next) {
          throw new CodexRpcError('protocol');
        }

        if (turn.status !== 'inProgress') {
          throw new CodexRpcError('protocol');
        }

        turnId = next;
        if (freshContext && !usageBaseline) {
          await emit({
            kind: 'usage',
            sampleId: 'native-baseline',
            basis: 'session-cumulative',
            counters: { inputTokens: 0, outputTokens: 0, cachedTokens: 0, reasoningTokens: 0 },
          });
          usageBaseline = true;
        }

        return;
      }

      if (params.turnId !== undefined && params.turnId !== turnId) {
        throw new CodexRpcError('protocol');
      }

      if (metadata.has(method)) {
        return;
      }

      if (!turnId) {
        throw new CodexRpcError('protocol');
      }

      if (method === 'item/started' || method === 'item/completed') {
        const item = rpcObject(params.item);
        const id = identifier(item.id);
        const kind = typeof item.type === 'string' ? item.type : '';
        if (duplicate(method + ':' + id, item)) {
          return;
        }

        if (
          ![
            'userMessage',
            'agentMessage',
            'reasoning',
            'plan',
            'contextCompaction',
            'commandExecution',
            'fileChange',
          ].includes(kind)
        ) {
          throw new CodexRpcError('protocol');
        }

        if (method === 'item/started') {
          if (active.size >= 128 || active.has(id)) {
            throw new CodexRpcError('capacity');
          }

          active.set(id, kind);
          if (kind === 'reasoning' || kind === 'commandExecution' || kind === 'fileChange') {
            await emit({
              kind: 'work-open',
              key: 'item:' + id,
              workKind: kind === 'reasoning' ? 'reasoning' : 'tool',
              title:
                kind === 'reasoning'
                  ? 'Codex reasoning'
                  : kind === 'fileChange'
                    ? 'Codex file changes'
                    : 'Codex command',
            });
          }

          if (kind === 'commandExecution') {
            await emit({
              kind: 'action-open',
              key: 'action:' + id,
              parentKey: 'item:' + id,
              title: 'Command',
            });
            await text('action:' + id, 'tool-input', textValue(item.command));
          }

          if (kind === 'fileChange') {
            if (
              !Array.isArray(item.changes) ||
              !item.changes.length ||
              item.changes.length > 64 ||
              !workspace
            ) {
              throw new CodexRpcError('protocol');
            }

            const targets: string[] = [];
            for (const raw of item.changes) {
              const change = rpcObject(raw),
                kind = rpcObject(change.kind);
              if (!['add', 'delete', 'update'].includes(String(kind.type))) {
                throw new CodexRpcError('protocol');
              }

              textValue(change.diff);
              for (const path of [
                change.path,
                ...(kind.move_path != null ? [kind.move_path] : []),
              ]) {
                if (typeof path !== 'string' || !path || Buffer.byteLength(path) > 4096) {
                  throw new CodexRpcError('protocol');
                }

                const target = resolve(workspace, path),
                  offset = relative(workspace, target);
                if (
                  offset === '..' ||
                  offset.startsWith('..\\') ||
                  offset.startsWith('../') ||
                  isAbsolute(offset)
                ) {
                  throw new CodexRpcError('protocol');
                }

                targets.push(target);
              }
            }

            patches.set(id, {
              targets,
              hash: createHash('sha256').update(JSON.stringify(item.changes)).digest('hex'),
            });
            await emit({
              kind: 'action-open',
              key: 'action:' + id,
              parentKey: 'item:' + id,
              title: 'Apply patch',
            });
            await text('action:' + id, 'tool-input', textValue(JSON.stringify(item.changes)));
          }

          return;
        }

        if (active.get(id) !== kind) {
          throw new CodexRpcError('protocol');
        }

        active.delete(id);
        if (kind === 'agentMessage') {
          const value = textValue(item.text);
          if (
            item.phase !== undefined &&
            item.phase !== null &&
            (typeof item.phase !== 'string' ||
              !['commentary', 'partial_answer', 'final_answer'].includes(item.phase))
          ) {
            throw new CodexRpcError('protocol');
          }

          if (item.phase === 'commentary') {
            await text('commentary:' + id, 'commentary', value);

            return;
          }

          if (pending?.final && item.phase !== 'final_answer') {
            throw new CodexRpcError('protocol');
          }

          if (pending?.final) {
            if (Buffer.byteLength(pending.text) + Buffer.byteLength(value) > 1024 * 1024) {
              throw new CodexRpcError('capacity');
            }

            pending.text += value;
          } else {
            await commentary();
            pending = { id, text: value, final: item.phase === 'final_answer' };
          }
        } else if (kind === 'reasoning') {
          const summary = item.summary ?? [],
            content = item.content ?? [];
          if (
            !Array.isArray(summary) ||
            summary.length > 128 ||
            !Array.isArray(content) ||
            content.length > 128
          ) {
            throw new CodexRpcError('protocol');
          }

          const reasoning = summary.map(textValue).concat(content.map(textValue)).join('\n');
          if (Buffer.byteLength(reasoning) > 1024 * 1024) {
            throw new CodexRpcError('capacity');
          }

          await text('item:' + id, 'reasoning', reasoning);
          await emit({ kind: 'work-update', key: 'item:' + id, state: 'completed' });
        } else if (kind === 'commandExecution') {
          if (!['completed', 'failed', 'declined'].includes(String(item.status))) {
            throw new CodexRpcError('protocol');
          }

          if (item.aggregatedOutput != null) {
            await text('action:' + id, 'tool-output', textValue(item.aggregatedOutput));
          }

          const state = item.status === 'completed' && item.exitCode === 0 ? 'completed' : 'failed';
          await emit({ kind: 'action-update', key: 'action:' + id, state });
          await emit({ kind: 'work-update', key: 'item:' + id, state });
        } else if (kind === 'fileChange') {
          if (
            !['completed', 'failed', 'declined'].includes(String(item.status)) ||
            !Array.isArray(item.changes) ||
            item.changes.length > 64
          ) {
            throw new CodexRpcError('protocol');
          }

          if (item.status === 'completed' && !writable) {
            throw new CodexRpcError('protocol');
          }

          if (
            patches.get(id)?.hash !==
            createHash('sha256').update(JSON.stringify(item.changes)).digest('hex')
          ) {
            throw new CodexRpcError('protocol');
          }

          patches.delete(id);
          await text('action:' + id, 'tool-output', textValue(JSON.stringify(item.changes)));
          const state = item.status === 'completed' ? 'completed' : 'failed';
          await emit({ kind: 'action-update', key: 'action:' + id, state });
          await emit({ kind: 'work-update', key: 'item:' + id, state });
        } else if (kind === 'plan') {
          await text('plan:' + id, 'commentary', textValue(item.text));
        }

        return;
      }

      if (
        [
          'item/agentMessage/delta',
          'item/reasoning/summaryTextDelta',
          'item/reasoning/textDelta',
          'item/commandExecution/outputDelta',
        ].includes(method)
      ) {
        const id = identifier(params.itemId);
        if (!active.has(id)) {
          throw new CodexRpcError('protocol');
        }

        // Do not append a delta and then the native completed text a second time.
        textValue(params.delta);

        return;
      }

      if (method === 'thread/tokenUsage/updated') {
        const nativeUsage = rpcObject(params.tokenUsage);
        const counters = rpcObject(nativeUsage.total);
        const output: Extract<DriverFact, { kind: 'usage' }>['counters'] = {};
        for (const [key, source] of [
          ['inputTokens', 'inputTokens'],
          ['outputTokens', 'outputTokens'],
          ['reasoningTokens', 'reasoningOutputTokens'],
        ] as const) {
          const value = counters[source];
          if (value !== undefined) {
            if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
              throw new CodexRpcError('protocol');
            }

            output[key] = value;
          }
        }

        const cached = counters.cachedInputTokens;
        if (cached !== undefined) {
          if (typeof cached !== 'number' || !Number.isSafeInteger(cached) || cached < 0) {
            throw new CodexRpcError('protocol');
          }

          output.cachedTokens = cached;
        }

        const hash = JSON.stringify(output);
        if (lastUsageHash !== hash) {
          await emit({
            kind: 'usage',
            sampleId: 'native-total:' + ++usageOrdinal,
            basis: 'session-cumulative',
            counters: output,
          });
          lastUsageHash = hash;
        }

        // Native TokenUsage::tokens_in_context_window uses last.totalTokens;
        // cumulative total is lifetime consumption and must not become occupancy.
        const last = nativeUsage.last == null ? undefined : rpcObject(nativeUsage.last);
        const occupied = last?.totalTokens;
        const capacity = nativeUsage.modelContextWindow;
        for (const count of [occupied, capacity]) {
          if (
            count != null &&
            (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0)
          ) {
            throw new CodexRpcError('protocol');
          }
        }

        if (occupied != null || capacity != null) {
          await emit({
            kind: 'measurement',
            metric: 'context',
            sampleId: 'native-context:' + ++usageOrdinal,
            value: {
              contextGeneration: createHash('sha256')
                .update(JSON.stringify([threadId, telemetryContext?.modelId]))
                .digest('hex'),
              ...(telemetryContext ?? {}),
              ...(occupied != null
                ? {
                    occupiedTokens: occupied as number,
                    ...(capacity != null ? { capacityTokens: capacity as number } : {}),
                  }
                : { capacityTokens: capacity as number }),
            },
          });
        }

        return;
      }

      if (method === 'error') {
        if (params.willRetry !== true) {
          await emit({
            kind: 'progress',
            activity: 'waiting',
            label: 'Codex reported an operation error.',
          });
        }

        return;
      }

      if (method !== 'turn/completed') {
        throw new CodexRpcError('protocol');
      }

      const turn = rpcObject(params.turn);
      if (
        turn.id !== turnId ||
        !['completed', 'failed', 'interrupted'].includes(String(turn.status))
      ) {
        throw new CodexRpcError('protocol');
      }

      if (turn.status === 'completed') {
        if (active.size) {
          throw new CodexRpcError('protocol');
        }

        if (pending) {
          await text('answer', 'answer', pending.text);
        }

        await emit({ kind: 'outcome', outcome: 'completed' });
      } else {
        await commentary();
        const error = turn.error == null ? {} : rpcObject(turn.error);
        const info = error.codexErrorInfo;
        const auth = info === 'unauthorized';
        const quota =
          info === 'usageLimitExceeded' ||
          info === 'rateLimitExceeded' ||
          info === 'sessionBudgetExceeded';
        await emit(
          turn.status === 'interrupted'
            ? { kind: 'outcome', outcome: 'interrupted' }
            : {
                kind: 'outcome',
                outcome: 'failed',
                error: {
                  code: auth ? 'PROVIDER_AUTH_REQUIRED' : 'PROVIDER_FAILED',
                  message: auth
                    ? 'Codex authentication is required.'
                    : quota
                      ? 'Codex quota or rate limit prevented the operation.'
                      : 'Codex reported an unsuccessful operation.',
                },
              },
        );
      }

      pending = undefined;
      active.clear();
      patches.clear();
      seen.clear();
      terminal = true;
    },
    async end() {
      if (terminal) {
        return;
      }

      await commentary();
      await emit({ kind: 'lost', message: 'Codex ended without an authoritative Turn outcome.' });
      active.clear();
      patches.clear();
      seen.clear();
      terminal = true;
    },
  };
}
