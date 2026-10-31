import { createHash } from 'node:crypto';
import type { DriverFact } from '../../persistence/protocol';
import type { EmitFact } from '../driver';
import { claudeReadTools } from './modes';

type ObjectValue = Record<string, unknown>;
export class ClaudeProtocolError extends Error {
  constructor() {
    super('Claude output violates the supported protocol.');
    this.name = 'ClaudeProtocolError';
  }
}
export function object(value: unknown): ObjectValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ClaudeProtocolError();
  }

  return value as ObjectValue;
}

export function identifier(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_.:-]{1,128}$/.test(value)) {
    throw new ClaudeProtocolError();
  }

  return value;
}

function string(value: unknown): string {
  if (typeof value !== 'string') {
    throw new ClaudeProtocolError();
  }

  return value;
}

function monetaryAmount(value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new ClaudeProtocolError();
  }

  let amount = String(value);
  if (amount.includes('e')) {
    const [mantissa, exponent] = amount.split('e');
    const [whole, fraction = ''] = mantissa!.split('.');
    const digits = whole! + fraction;
    const point = whole!.length + Number(exponent);
    amount =
      point <= 0
        ? '0.' + '0'.repeat(-point) + digits
        : point >= digits.length
          ? digits + '0'.repeat(point - digits.length)
          : digits.slice(0, point) + '.' + digits.slice(point);
  }

  if (!/^(0|[1-9][0-9]{0,15})(\.[0-9]{1,12})?$/.test(amount)) {
    throw new ClaudeProtocolError();
  }

  return amount;
}

function blocks(message: unknown): ObjectValue[] {
  const content = object(message).content;
  if (!Array.isArray(content) || content.length > 256) {
    throw new ClaudeProtocolError();
  }

  return content.map(object);
}

/** Full-message stream-json mode: partial stream events are deliberately not requested.
 * Only a structured result establishes success. A bounded pending text message avoids
 * publishing the final assistant response twice (assistant + result).
 */
export function createClaudeProtocol(
  emit: EmitFact,
  expectedSessionId: string,
  allowedTools: readonly string[] = claudeReadTools,
  freshContext = false,
) {
  identifier(expectedSessionId);
  const seen = new Map<string, string>();
  const tools = new Map<string, { parent: string; key: string }>();
  const groups = new Map<string, { remaining: number; failed: boolean }>();
  let correlated = false;
  let terminal = false;
  let busy = false;
  let ordinal = 0;
  let limitOrdinal = 0;
  let pending: { key: string; text: string; messageId: string } | undefined;
  async function text(
    key: string,
    channel: Extract<DriverFact, { kind: 'text' }>['channel'],
    value: string,
  ) {
    const bytes = Buffer.from(value);
    for (let start = 0; start < bytes.length;) {
      let end = Math.min(start + 16384, bytes.length);
      while (end < bytes.length && (bytes[end]! & 0xc0) === 0x80) {
        end--;
      }

      await emit({ kind: 'text', key, channel, text: bytes.subarray(start, end).toString('utf8') });
      start = end;
    }
  }

  async function flushCommentary() {
    if (!pending) {
      return;
    }

    await emit({
      kind: 'work-open',
      key: pending.key,
      workKind: 'commentary',
      title: 'Claude commentary',
    });
    await text(pending.key, 'commentary', pending.text);
    await emit({ kind: 'work-update', key: pending.key, state: 'completed' });
    pending = undefined;
  }

  async function correlate(frame: ObjectValue) {
    if (frame.session_id === undefined) {
      return;
    }

    if (identifier(frame.session_id) !== expectedSessionId) {
      throw new ClaudeProtocolError();
    }

    if (!correlated) {
      await emit({ kind: 'correlation', providerSessionId: expectedSessionId });
      correlated = true;
    }
  }

  async function consume(frame: ObjectValue) {
    await correlate(frame);
    if (frame.type === 'system') {
      if (
        !['init', 'status', 'compact_boundary', 'api_retry', 'session_state_changed'].includes(
          string(frame.subtype),
        )
      ) {
        throw new ClaudeProtocolError();
      }

      return;
    }

    if (frame.type === 'rate_limit_event') {
      // The official SDK parser reads rate_limit_info (snake case), with
      // utilization as a consumed fraction and resetsAt as Unix seconds.
      // Status alone supplies neither a numeric amount nor a known window.
      if (frame.rate_limit_info === undefined) {
        return;
      }

      const info = object(frame.rate_limit_info);
      const windowSeconds =
        info.rateLimitType === 'five_hour'
          ? 18000
          : info.rateLimitType === 'seven_day'
            ? 604800
            : undefined;
      if (
        !windowSeconds ||
        !['allowed', 'allowed_warning', 'rejected'].includes(String(info.status)) ||
        typeof info.utilization !== 'number' ||
        !Number.isFinite(info.utilization) ||
        info.utilization < 0 ||
        info.utilization > 1
      ) {
        return;
      }

      let fraction: string;
      try {
        fraction = monetaryAmount(info.utilization);
      } catch {
        return;
      }

      const [whole, decimals = ''] = fraction.split('.');
      const tail = decimals.slice(2).replace(/0+$/, '');
      const used =
        String(Number(whole) * 100 + Number(decimals.slice(0, 2).padEnd(2, '0'))) +
        (tail ? '.' + tail : '');
      let resetsAt: string | undefined;
      if (info.resetsAt !== undefined) {
        if (
          typeof info.resetsAt !== 'number' ||
          !Number.isSafeInteger(info.resetsAt) ||
          info.resetsAt < 0 ||
          info.resetsAt > 253402300799
        ) {
          return;
        }

        resetsAt = new Date(info.resetsAt * 1000).toISOString();
      }

      await emit({
        kind: 'measurement',
        metric: 'limits',
        sampleId: 'claude-rate-limit:' + ++limitOrdinal,
        windowUpdate: true,
        value: {
          windows: [
            {
              windowId: createHash('sha256')
                .update('claude:' + String(info.rateLimitType))
                .digest('hex'),
              scope: 'account',
              unit: 'percent',
              used,
              windowSeconds,
              ...(resetsAt ? { resetsAt } : {}),
            },
          ],
        },
      });

      return;
    }

    if (frame.type === 'assistant') {
      // SDK error assistant prose can include private diagnostics. A structured result
      // below owns its public failure classification, never the arbitrary error text.
      if (frame.error !== undefined) {
        return;
      }

      const message = object(frame.message);
      const messageId = identifier(message.id);
      const id = identifier(frame.uuid);
      if (frame.parent_tool_use_id !== undefined && frame.parent_tool_use_id !== null) {
        throw new ClaudeProtocolError();
      }

      if (pending && pending.messageId !== messageId) {
        await flushCommentary();
      }

      const content = blocks(message);
      const toolBlocks = content.filter((block) => block.type === 'tool_use');
      if (tools.size + toolBlocks.length > 128) {
        throw new ClaudeProtocolError();
      }

      let prose = '';
      let reasoning = '';
      for (const block of content) {
        if (block.type === 'text') {
          prose += string(block.text);
        } else if (block.type === 'thinking') {
          reasoning += string(block.thinking);
        } else if (block.type !== 'tool_use' && block.type !== 'redacted_thinking') {
          throw new ClaudeProtocolError();
        }
      }

      const sequence = ++ordinal;
      if (reasoning) {
        const key = 'reasoning:' + sequence;
        await emit({ kind: 'work-open', key, workKind: 'reasoning', title: 'Claude reasoning' });
        await text(key, 'reasoning', reasoning);
        await emit({ kind: 'work-update', key, state: 'completed' });
      }

      if (prose) {
        if (Buffer.byteLength(pending?.text ?? '') + Buffer.byteLength(prose) > 1024 * 1024) {
          throw new ClaudeProtocolError();
        }

        pending = {
          key: pending?.key ?? 'commentary:' + sequence,
          text: (pending?.text ?? '') + prose,
          messageId,
        };
      }

      if (toolBlocks.length) {
        await flushCommentary();
        const parent = 'tools:' + id;
        if (groups.has(parent)) {
          throw new ClaudeProtocolError();
        }

        groups.set(parent, { remaining: toolBlocks.length, failed: false });
        await emit({ kind: 'work-open', key: parent, workKind: 'tool', title: 'Claude tools' });
        for (const block of toolBlocks) {
          const toolId = identifier(block.id);
          const key = 'tool:' + toolId;
          const name = identifier(block.name);
          if (!allowedTools.includes(name)) {
            throw new ClaudeProtocolError();
          }

          const input = object(block.input);
          if (
            name === 'Bash' &&
            (input.run_in_background === true || input.dangerouslyDisableSandbox === true)
          ) {
            throw new ClaudeProtocolError();
          }

          if (tools.has(toolId)) {
            throw new ClaudeProtocolError();
          }

          tools.set(toolId, { parent, key });
          await emit({ kind: 'action-open', key, parentKey: parent, title: name });
          await text(key, 'tool-input', JSON.stringify(input));
        }
      }

      return;
    }

    if (frame.type === 'user') {
      for (const block of blocks(frame.message)) {
        if (block.type !== 'tool_result') {
          continue;
        }

        const toolId = identifier(block.tool_use_id);
        const tool = tools.get(toolId);
        if (!tool) {
          throw new ClaudeProtocolError();
        }

        if (block.is_error !== undefined && typeof block.is_error !== 'boolean') {
          throw new ClaudeProtocolError();
        }

        const output =
          typeof block.content === 'string' ? block.content : JSON.stringify(block.content ?? []);
        await text(tool.key, 'tool-output', output);
        await emit({
          kind: 'action-update',
          key: tool.key,
          state: block.is_error ? 'failed' : 'completed',
        });
        tools.delete(toolId);
        const group = groups.get(tool.parent)!;
        group.failed ||= block.is_error === true;
        if (--group.remaining === 0) {
          await emit({
            kind: 'work-update',
            key: tool.parent,
            state: group.failed ? 'failed' : 'completed',
          });
          groups.delete(tool.parent);
        }
      }

      return;
    }

    if (frame.type !== 'result') {
      throw new ClaudeProtocolError();
    }

    if (
      frame.subtype !== 'success' &&
      ![
        'error_during_execution',
        'error_max_turns',
        'error_max_budget_usd',
        'error_max_structured_output_retries',
      ].includes(string(frame.subtype))
    ) {
      throw new ClaudeProtocolError();
    }

    if (typeof frame.is_error !== 'boolean') {
      throw new ClaudeProtocolError();
    }

    // Deferred tools and background work are outside this supported subset.
    // Never turn a superficially successful envelope into a fabricated completion.
    const terminalReason =
      frame.terminal_reason == null ? undefined : string(frame.terminal_reason);
    const interrupted = ['aborted_streaming', 'aborted_tools'].includes(terminalReason ?? '');
    if (
      (!frame.is_error &&
        terminalReason !== undefined &&
        !['completed', 'aborted_streaming', 'aborted_tools'].includes(terminalReason)) ||
      (!frame.is_error && frame.stop_reason != null && frame.stop_reason !== 'end_turn') ||
      frame.deferred_tool_use != null ||
      (frame.origin != null && object(frame.origin).kind !== 'human')
    ) {
      throw new ClaudeProtocolError();
    }

    const success = frame.subtype === 'success' && frame.is_error === false && !interrupted;
    if (success && (!correlated || tools.size)) {
      throw new ClaudeProtocolError();
    }

    if (!success) {
      await flushCommentary();
    } else {
      const answer = frame.result === undefined ? pending?.text : string(frame.result);
      if (answer) {
        await text('answer', 'answer', answer);
      }

      pending = undefined;
    }

    // Result usage is invocation-total. Assistant and partial-event usage are intentionally
    // excluded: adding those samples would count the same tokens twice.
    if (frame.usage !== undefined) {
      const native = object(frame.usage);
      const counters: Extract<DriverFact, { kind: 'usage' }>['counters'] = {};
      for (const [key, target] of [
        ['input_tokens', 'inputTokens'],
        ['output_tokens', 'outputTokens'],
        ['cache_read_input_tokens', 'cachedTokens'],
        ['cache_creation_input_tokens', 'cacheWriteTokens'],
      ] as const) {
        const value = native[key];
        if (value !== undefined) {
          if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
            throw new ClaudeProtocolError();
          }

          counters[target] = value;
        }
      }

      await emit({ kind: 'usage', sampleId: 'claude-result', basis: 'turn-total', counters });
    }

    if (frame.total_cost_usd !== undefined) {
      // Native result cost restores earlier spend on resume. It is an API cost
      // estimate reported by Claude, not a subscription billing statement.
      const amount = monetaryAmount(frame.total_cost_usd);
      const value = {
        currency: 'USD' as const,
        amount,
        basis: 'provider-reported' as const,
        meaning: 'api-equivalent' as const,
      };
      if (freshContext) {
        await emit({
          kind: 'measurement',
          sampleId: 'claude-cost-baseline',
          metric: 'cost',
          basis: 'session-cumulative',
          value: { ...value, amount: '0' },
        });
      }

      await emit({
        kind: 'measurement',
        sampleId: 'claude-result-cost',
        metric: 'cost',
        basis: 'session-cumulative',
        value,
      });
    }

    await emit(
      interrupted
        ? {
            kind: 'outcome',
            outcome: 'interrupted',
            error: { code: 'INTERRUPTED', message: 'Claude reported an interrupted operation.' },
          }
        : success
          ? { kind: 'outcome', outcome: 'completed' }
          : {
              kind: 'outcome',
              outcome: 'failed',
              error: {
                code: frame.api_error_status === 401 ? 'PROVIDER_AUTH_REQUIRED' : 'PROVIDER_FAILED',
                message:
                  frame.api_error_status === 429
                    ? 'Claude quota or rate limit prevented the operation.'
                    : frame.api_error_status === 401
                      ? 'Claude authentication is required.'
                      : 'Claude reported an unsuccessful result.',
              },
            },
    );
    tools.clear();
    groups.clear();
    seen.clear();
    terminal = true;
  }

  return {
    get terminal() {
      return terminal;
    },
    async accept(line: string) {
      if (terminal) {
        return;
      }

      if (busy) {
        throw new ClaudeProtocolError();
      }

      busy = true;
      try {
        if (Buffer.byteLength(line) > 1024 * 1024) {
          throw new ClaudeProtocolError();
        }

        let frame: ObjectValue;
        try {
          frame = object(JSON.parse(line));
        } catch {
          throw new ClaudeProtocolError();
        }

        if (typeof frame.type !== 'string') {
          throw new ClaudeProtocolError();
        }

        if (frame.type === 'system' && frame.subtype === 'thinking_tokens') {
          // Estimates are non-authoritative progress. Validate and ignore before
          // the UUID ledger so long thinking cannot exhaust lifecycle deduplication.
          identifier(frame.uuid);
          if (
            identifier(frame.session_id) !== expectedSessionId ||
            !Number.isSafeInteger(frame.estimated_tokens) ||
            !Number.isSafeInteger(frame.estimated_tokens_delta)
          ) {
            throw new ClaudeProtocolError();
          }

          if (frame.user_message_uuid !== undefined) {
            identifier(frame.user_message_uuid);
          }

          await correlate(frame);

          return;
        }

        if (frame.type === 'tool_progress') {
          // Foreground shell progress also has task_id and may use an internal
          // bash-progress-* ID. It is not an action/result or background receipt.
          identifier(frame.uuid);
          identifier(frame.tool_use_id);
          const name = identifier(frame.tool_name);
          if (
            identifier(frame.session_id) !== expectedSessionId ||
            !allowedTools.includes(name) ||
            frame.parent_tool_use_id !== null ||
            !Number.isSafeInteger(frame.elapsed_time_seconds) ||
            (frame.heartbeat !== undefined && typeof frame.heartbeat !== 'boolean') ||
            frame.subagent_type !== undefined ||
            frame.subagent_retry !== undefined
          ) {
            throw new ClaudeProtocolError();
          }

          if (frame.task_id !== undefined) {
            identifier(frame.task_id);
          }

          await correlate(frame);

          return;
        }

        // Native UUID deduplication is bounded. Never evict then replay an old event as new.
        // Sibling assistant envelopes can share message.id. Only the outer UUID identifies
        // a native event; requiring it avoids confusing tool siblings with changed duplicates.
        if (frame.type === 'assistant') {
          identifier(frame.uuid);
        }

        const nativeId = frame.uuid;
        if (nativeId !== undefined) {
          const id = frame.type + ':' + identifier(nativeId);
          const hash = createHash('sha256').update(line).digest('hex');
          const previous = seen.get(id);
          if (previous !== undefined) {
            if (previous !== hash) {
              throw new ClaudeProtocolError();
            }

            return;
          }

          if (seen.size >= 4096) {
            throw new ClaudeProtocolError();
          }

          seen.set(id, hash);
        }

        await consume(frame);
      } finally {
        busy = false;
      }
    },
    async end() {
      if (terminal) {
        return;
      }

      if (busy) {
        throw new ClaudeProtocolError();
      }

      await flushCommentary();
      await emit({ kind: 'lost', message: 'Claude ended without an authoritative result.' });
      tools.clear();
      groups.clear();
      seen.clear();
      terminal = true;
    },
  };
}
