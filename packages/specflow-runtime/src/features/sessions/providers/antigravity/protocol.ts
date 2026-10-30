import { createHash } from 'node:crypto';
import type { DriverFact } from '../../persistence/protocol';
import type { EmitFact } from '../driver';

const frameBytes = 1024 * 1024;
const chunkBytes = 16384;
const maxSteps = 1024;
// A final candidate can occupy the same bounded budget as a result frame.
// Overflow must not relabel part of a final answer as commentary.
const pendingBytes = frameBytes;

export class AntigravityProtocolError extends Error {
  constructor() {
    super('Antigravity output violates the supported protocol.');
    this.name = 'AntigravityProtocolError';
  }
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AntigravityProtocolError();
  }

  return value as Record<string, unknown>;
}

function text(value: unknown, max = frameBytes): string {
  if (typeof value !== 'string' || Buffer.byteLength(value) > max) {
    throw new AntigravityProtocolError();
  }

  return value;
}

function identifier(value: unknown): string {
  const result = text(value, 128);
  if (!/^[A-Za-z0-9_.:-]{1,128}$/.test(result)) {
    throw new AntigravityProtocolError();
  }

  return result;
}

export function parseAntigravityFrame(line: string): Record<string, unknown> {
  if (Buffer.byteLength(line) > frameBytes) {
    throw new AntigravityProtocolError();
  }

  try {
    return object(JSON.parse(line));
  } catch {
    throw new AntigravityProtocolError();
  }
}

export interface AntigravityInit {
  conversationId: string;
  cwd: string;
  tools: readonly string[];
  permissionMode: string;
  model?: string;
  agent?: string;
}

export function parseAntigravityInit(frame: Record<string, unknown>): AntigravityInit {
  if (frame.event !== 'init') {
    throw new AntigravityProtocolError();
  }

  const init = object(frame.init);
  const tools = init.tools;
  if (!Array.isArray(tools) || tools.length > 256) {
    throw new AntigravityProtocolError();
  }

  const inventory = tools.map((tool) => text(tool, 256));
  if (
    inventory.some((tool) => !tool || tool.includes('\0')) ||
    new Set(inventory).size !== inventory.length
  ) {
    throw new AntigravityProtocolError();
  }

  return {
    conversationId: identifier(frame.conversation_id),
    cwd: text(init.cwd, 4096),
    tools: inventory,
    permissionMode: text(init.permission_mode, 128),
    ...(init.model === undefined ? {} : { model: text(init.model, 256) }),
    ...(init.agent === undefined ? {} : { agent: text(init.agent, 256) }),
  };
}

/** Native step identity controls deduplication. Incremental ACTIVE text is not
 * deduplicated by content: equal consecutive deltas may be legitimate tokens. */
export function createAntigravityProtocol(
  emit: EmitFact,
  conversationId: string,
  freshContext = false,
) {
  identifier(conversationId);
  const steps = new Map<
    number,
    {
      type: string;
      done?: string;
      opened: boolean;
      toolName?: string;
      parametersHash?: string;
    }
  >();
  const reasoning = new Set<number>();
  let terminal = false;
  let busy = false;
  let pending: { index: number; value: string } | undefined;

  async function content(
    key: string,
    channel: Extract<DriverFact, { kind: 'text' }>['channel'],
    value: string,
  ) {
    const bytes = Buffer.from(value);
    for (let offset = 0; offset < bytes.length;) {
      let end = Math.min(offset + chunkBytes, bytes.length);
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
    if (pending) {
      await content('commentary:' + pending.index, 'commentary', pending.value);
      pending = undefined;
    }
  }

  async function frame(value: Record<string, unknown>) {
    if (terminal || busy) {
      throw new AntigravityProtocolError();
    }

    busy = true;
    try {
      if (value.event === 'result') {
        const result = object(value.result);
        if (identifier(result.conversation_id) !== conversationId) {
          throw new AntigravityProtocolError();
        }

        const response = text(result.response);
        const status = text(result.status, 64);
        if (!['SUCCESS', 'ERROR', 'FAILED', 'TIMEOUT', 'INTERRUPTED'].includes(status)) {
          throw new AntigravityProtocolError();
        }

        if (
          status === 'SUCCESS' &&
          (result.is_error === true || (result.error !== undefined && result.error !== ''))
        ) {
          throw new AntigravityProtocolError();
        }

        if (
          status === 'SUCCESS' &&
          ([...steps.values()].some((step) => step.opened && !step.done) || reasoning.size)
        ) {
          throw new AntigravityProtocolError();
        }

        if (result.usage !== undefined) {
          const usage = object(result.usage);
          const counters: NonNullable<Extract<DriverFact, { kind: 'usage' }>['counters']> = {};
          const fields = {
            input_tokens: 'inputTokens',
            output_tokens: 'outputTokens',
            thinking_tokens: 'reasoningTokens',
            cache_read_tokens: 'cachedTokens',
          } as const;
          for (const [native, canonical] of Object.entries(fields)) {
            const count = usage[native];
            if (count !== undefined) {
              if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) {
                throw new AntigravityProtocolError();
              }

              counters[canonical] = count;
            }
          }

          if (freshContext) {
            await emit({
              kind: 'usage',
              sampleId: 'antigravity-baseline',
              basis: 'session-cumulative',
              counters: { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, cachedTokens: 0 },
            });
          }

          await emit({
            kind: 'usage',
            sampleId: 'antigravity-result',
            basis: 'session-cumulative',
            counters,
          });
        }

        // The structured response is the authoritative current answer. A bounded
        // pending agent_response is omitted when it is already represented there.
        if (!response || status !== 'SUCCESS') {
          await commentary();
        } else {
          pending = undefined;
        }

        if (response && status === 'SUCCESS') {
          await content('answer', 'answer', response);
        }

        for (const [index, step] of steps) {
          if (step.opened && !step.done) {
            await emit({ kind: 'action-update', key: 'tool:' + index, state: 'interrupted' });
            await emit({ kind: 'work-update', key: 'step:' + index, state: 'interrupted' });
          }
        }

        for (const index of reasoning) {
          await emit({ kind: 'work-update', key: 'reasoning:' + index, state: 'interrupted' });
        }

        terminal = true;
        if (status === 'SUCCESS') {
          await emit({ kind: 'outcome', outcome: 'completed' });
        } else if (status === 'INTERRUPTED') {
          await emit({ kind: 'outcome', outcome: 'interrupted' });
        } else {
          await emit({
            kind: 'outcome',
            outcome: 'failed',
            error: {
              code: status === 'TIMEOUT' ? 'TIMEOUT' : 'PROVIDER_FAILED',
              message:
                status === 'TIMEOUT'
                  ? 'Antigravity exceeded its native execution deadline.'
                  : 'Antigravity could not complete this turn. Check provider authentication and account quota.',
            },
          });
        }

        return;
      }

      if (value.event !== 'step_update') {
        throw new AntigravityProtocolError();
      }

      const step = object(value.step_update);
      if (
        identifier(step.conversation_id) !== conversationId ||
        !Number.isSafeInteger(step.step_index) ||
        (step.step_index as number) < 0
      ) {
        throw new AntigravityProtocolError();
      }

      const index = step.step_index as number;
      const kind = text(step.step_type, 128);
      if (
        !['ACTIVE', 'DONE'].includes(String(step.state)) ||
        ![
          'user_input',
          'agent_response',
          'tool',
          'checkpoint',
          'reasoning',
          'thinking',
          'error_message',
        ].includes(kind)
      ) {
        throw new AntigravityProtocolError();
      }

      let tracked = steps.get(index);
      if (!tracked) {
        if (steps.size >= maxSteps) {
          throw new AntigravityProtocolError();
        }

        tracked = { type: kind, opened: false };
        steps.set(index, tracked);
      } else if (tracked.type !== kind) {
        throw new AntigravityProtocolError();
      }

      const fingerprint = createHash('sha256').update(JSON.stringify(step)).digest('hex');
      if (tracked.done) {
        if (step.state !== 'DONE' || tracked.done !== fingerprint) {
          throw new AntigravityProtocolError();
        }

        return;
      }

      if (pending && pending.index !== index) {
        await commentary();
      }

      if (kind === 'agent_response') {
        const delta = step.text_delta === undefined ? '' : text(step.text_delta);
        await emit({
          kind: 'progress',
          activity: 'responding',
          label: 'Antigravity is responding.',
        });
        if (Buffer.byteLength(pending?.value ?? '') + Buffer.byteLength(delta) > pendingBytes) {
          throw new AntigravityProtocolError();
        }

        pending = { index, value: (pending?.value ?? '') + delta };
      }

      const thought =
        kind === 'reasoning' || kind === 'thinking'
          ? (step.text_delta ?? step.thought ?? step.thinking)
          : (step.thought ?? step.thinking);
      if (thought !== undefined) {
        if (!reasoning.has(index)) {
          await emit({
            kind: 'work-open',
            key: 'reasoning:' + index,
            workKind: 'reasoning',
            title: 'Antigravity reasoning',
          });
          reasoning.add(index);
        }

        await content('reasoning:' + index, 'reasoning', text(thought));
      }

      if (step.state === 'DONE' && reasoning.delete(index)) {
        await emit({ kind: 'work-update', key: 'reasoning:' + index, state: 'completed' });
      }

      if (kind === 'tool') {
        const info = object(step.tool_info ?? {});
        const name = text(step.tool_name ?? info.name ?? tracked.toolName, 256);
        if (
          (info.name !== undefined && info.name !== name) ||
          (tracked.toolName !== undefined && tracked.toolName !== name)
        ) {
          throw new AntigravityProtocolError();
        }

        tracked.toolName = name;

        if (!tracked.opened) {
          await emit({ kind: 'work-open', key: 'step:' + index, workKind: 'tool', title: name });
          tracked.opened = true;
          await emit({
            kind: 'action-open',
            key: 'tool:' + index,
            parentKey: 'step:' + index,
            title: name,
          });
        }

        if (info.parameters !== undefined) {
          const parameters = text(JSON.stringify(info.parameters));
          const hash = createHash('sha256').update(parameters).digest('hex');
          if (tracked.parametersHash !== undefined && tracked.parametersHash !== hash) {
            throw new AntigravityProtocolError();
          }

          if (tracked.parametersHash === undefined) {
            await content('tool:' + index, 'tool-input', parameters);
            tracked.parametersHash = hash;
          }
        }

        if (step.state === 'DONE') {
          if (info.output !== undefined) {
            await content('tool:' + index, 'tool-output', text(info.output));
          }

          await emit({
            kind: 'action-update',
            key: 'tool:' + index,
            state: info.error == null ? 'completed' : 'failed',
          });
          await emit({
            kind: 'work-update',
            key: 'step:' + index,
            state: info.error == null ? 'completed' : 'failed',
          });
        }
      }

      if (step.state === 'DONE') {
        tracked.done = fingerprint;
      }
    } finally {
      busy = false;
    }
  }

  return {
    frame,
    get terminal() {
      return terminal;
    },
  };
}
