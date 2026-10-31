import { describe, expect, it } from 'vitest';
import type { DriverFact } from '../../persistence/protocol';
import { validateDriverFact } from '../facts';
import { createClaudeProtocol } from './protocol';

const sessionId = 'b6d81fa6-d1fc-4841-8241-bc1ae33cbb1f';
function fixture(allowedTools?: readonly string[], freshContext = false) {
  const facts: DriverFact[] = [];
  const protocol = createClaudeProtocol(
    (fact) => {
      validateDriverFact(fact);
      facts.push(fact);

      return Promise.resolve();
    },
    sessionId,
    allowedTools,
    freshContext,
  );
  const accept = (frame: unknown) => protocol.accept(JSON.stringify(frame));
  const assistant = (id: string, content: unknown[]) =>
    accept({
      type: 'assistant',
      uuid: id,
      session_id: sessionId,
      message: { id, content },
    });
  const result = (extra: Record<string, unknown> = {}) =>
    accept({
      type: 'result',
      session_id: sessionId,
      subtype: 'success',
      is_error: false,
      ...extra,
    });

  return { facts, protocol, accept, assistant, result };
}

describe('Claude full-message protocol', () => {
  it('maps documented Claude account quota fractions without inferring consumption from status', async () => {
    const f = fixture();
    for (const rateLimitType of ['five_hour', 'seven_day']) {
      await f.accept({
        type: 'rate_limit_event',
        uuid: rateLimitType,
        session_id: sessionId,
        rate_limit_info: {
          status: 'allowed_warning',
          utilization: 0.563,
          rateLimitType,
          resetsAt: 1730947200,
          privateLabel: 'never published',
        },
      });
    }

    const samples = f.facts.filter(
      (fact) => fact.kind === 'measurement' && fact.metric === 'limits',
    );
    expect(samples.every((sample) => sample.windowUpdate === true)).toBe(true);
    expect(samples.map((sample) => sample.value.windows[0])).toEqual([
      {
        windowId: expect.any(String) as string,
        scope: 'account',
        unit: 'percent',
        used: '56.3',
        windowSeconds: 18000,
        resetsAt: '2024-11-07T02:40:00.000Z',
      },
      {
        windowId: expect.any(String) as string,
        scope: 'account',
        unit: 'percent',
        used: '56.3',
        windowSeconds: 604800,
        resetsAt: '2024-11-07T02:40:00.000Z',
      },
    ]);
    expect(samples[0]!.value.windows[0]!.windowId).not.toBe(samples[1]!.value.windows[0]!.windowId);
    expect(JSON.stringify(samples)).not.toMatch(/never published|session_id/);
    expect(f.protocol.terminal).toBe(false);
  });

  it('leaves unsupported or incomplete Claude quota events unavailable', async () => {
    const f = fixture();
    for (const info of [
      { status: 'rejected', rateLimitType: 'five_hour' },
      { status: 'allowed', utilization: 0 },
      { status: 'allowed', utilization: -0.1, rateLimitType: 'five_hour' },
      { status: 'allowed', utilization: 1.01, rateLimitType: 'five_hour' },
      { status: 'allowed', utilization: 0.5, rateLimitType: 'unknown' },
      { status: 'allowed', utilization: 0.5, rateLimitType: 'seven_day_opus' },
      { status: 'allowed', utilization: 0.5, rateLimitType: 'overage' },
      { status: 'allowed', utilization: 0.5, rateLimitType: 'five_hour', resetsAt: 1730947200000 },
    ]) {
      await f.accept({ type: 'rate_limit_event', rate_limit_info: info, session_id: sessionId });
    }

    await f.accept({
      type: 'rate_limit_event',
      rateLimitInfo: { status: 'allowed', utilization: 0.5, rateLimitType: 'five_hour' },
      session_id: sessionId,
    });
    expect(f.facts.filter((fact) => fact.kind === 'measurement')).toEqual([]);
  });
  it('preserves native cumulative USD cost and cache creation without inferring a resumed baseline', async () => {
    const f = fixture();
    await f.result({ total_cost_usd: 1e-7, usage: { cache_creation_input_tokens: 12 } });
    expect(f.facts.filter((fact) => fact.kind === 'measurement')).toEqual([
      {
        kind: 'measurement',
        metric: 'cost',
        sampleId: 'claude-result-cost',
        basis: 'session-cumulative',
        value: {
          currency: 'USD',
          amount: '0.0000001',
          basis: 'provider-reported',
          meaning: 'api-equivalent',
        },
      },
    ]);
    expect(f.facts.find((fact) => fact.kind === 'usage')).toMatchObject({
      counters: { cacheWriteTokens: 12 },
    });
    const fresh = fixture(undefined, true);
    await fresh.result({ total_cost_usd: 0.25 });
    const costFacts = fresh.facts.filter(
      (fact) => fact.kind === 'measurement' && fact.metric === 'cost',
    );
    expect(costFacts.map((fact) => fact.baseline)).toEqual([true, undefined]);
    expect(
      fresh.facts.filter((fact) => fact.kind === 'measurement').map((fact) => fact.value),
    ).toEqual([
      { currency: 'USD', amount: '0', basis: 'provider-reported', meaning: 'api-equivalent' },
      { currency: 'USD', amount: '0.25', basis: 'provider-reported', meaning: 'api-equivalent' },
    ]);
  });

  it.each([-1, Infinity, '0.1', 1e-13, 0.1234567890123])(
    'omits invalid or unrepresentable optional money without losing the result: %s',
    async (total_cost_usd) => {
      const f = fixture();
      await f.result({ total_cost_usd });
      expect(f.facts.filter((fact) => fact.kind === 'measurement')).toEqual([]);
      expect(f.facts.at(-1)).toEqual({ kind: 'outcome', outcome: 'completed' });
    },
  );
  it('accepts foreground tool progress with internal IDs without changing tool state or usage', async () => {
    const f = fixture(['Bash']);
    await f.assistant('command', [
      { type: 'tool_use', id: 'tool-1', name: 'Bash', input: { command: 'echo test' } },
    ]);
    const before = f.facts.length;
    for (let at = 0; at < 4100; at++) {
      await f.accept({
        type: 'tool_progress',
        uuid: 'progress-' + at,
        session_id: sessionId,
        tool_use_id: 'bash-progress-1',
        tool_name: 'Bash',
        parent_tool_use_id: null,
        elapsed_time_seconds: at,
        task_id: 'task-1',
        heartbeat: true,
      });
    }

    expect(f.facts).toHaveLength(before); // No canonical progress writes.
    expect(f.protocol.terminal).toBe(false);
    await f.accept({
      type: 'user',
      session_id: sessionId,
      message: { content: [{ type: 'tool_result', tool_use_id: 'tool-1', content: 'test' }] },
    });
    await f.result({ result: 'Done' });
    expect(f.facts.at(-1)).toEqual({ kind: 'outcome', outcome: 'completed' });
  });
  it.each([
    { tool_name: 'Agent' },
    { parent_tool_use_id: 'agent-1' },
    { subagent_type: 'explore' },
    { heartbeat: 'true' },
    { elapsed_time_seconds: 0.5 },
    { task_id: 123 },
    { session_id: 'other' },
  ])('rejects unsupported tool progress without mutating lifecycle: %j', async (change) => {
    const f = fixture(['Bash']);
    await expect(
      f.accept({
        type: 'tool_progress',
        uuid: 'progress-1',
        session_id: sessionId,
        tool_use_id: 'bash-progress-1',
        tool_name: 'Bash',
        parent_tool_use_id: null,
        elapsed_time_seconds: 1,
        ...change,
      }),
    ).rejects.toThrow();
    expect(f.facts.some((fact) => fact.kind === 'usage' || fact.kind === 'outcome')).toBe(false);
  });
  it('accepts correlated native thinking estimates without inventing usage or terminal state', async () => {
    const f = fixture();
    await f.accept({
      type: 'system',
      subtype: 'thinking_tokens',
      uuid: 'estimate-1',
      session_id: sessionId,
      estimated_tokens: 12,
      estimated_tokens_delta: 4,
      user_message_uuid: 'message-1',
    });
    expect(f.facts).toEqual([{ kind: 'correlation', providerSessionId: sessionId }]);
    expect(f.protocol.terminal).toBe(false);
    await f.assistant('answer', [
      { type: 'thinking', thinking: 'Provider-emitted reasoning' },
      { type: 'text', text: 'Resumed answer' },
    ]);
    await f.result({ result: 'Resumed answer', usage: { output_tokens: 2 } });
    expect(f.facts.filter((fact) => fact.kind === 'usage')).toEqual([
      {
        kind: 'usage',
        sampleId: 'claude-result',
        basis: 'turn-total',
        counters: { outputTokens: 2 },
      },
    ]);
    expect(f.facts.at(-1)).toEqual({ kind: 'outcome', outcome: 'completed' });
    expect(f.facts).toContainEqual(
      expect.objectContaining({
        kind: 'text',
        channel: 'reasoning',
        text: 'Provider-emitted reasoning',
      }),
    );
  });
  it('does not consume lifecycle deduplication capacity for ignored thinking progress', async () => {
    const f = fixture();
    for (let at = 0; at < 4100; at++) {
      await f.accept({
        type: 'system',
        subtype: 'thinking_tokens',
        uuid: 'estimate-' + at,
        session_id: sessionId,
        estimated_tokens: at,
        estimated_tokens_delta: at === 4099 ? -1 : 1,
      });
    }

    await f.assistant('answer', [{ type: 'text', text: 'Done' }]);
    await f.result({ result: 'Done' });
    expect(f.facts.at(-1)).toEqual({ kind: 'outcome', outcome: 'completed' });
    expect(f.facts.filter((fact) => fact.kind === 'correlation')).toHaveLength(1);
  });
  it.each([
    { estimated_tokens: '12' },
    { estimated_tokens_delta: 0.5 },
    { session_id: 'another-session' },
    { uuid: undefined },
  ])('rejects malformed or uncorrelated thinking progress: %j', async (change) => {
    const f = fixture();
    await expect(
      f.accept({
        type: 'system',
        subtype: 'thinking_tokens',
        uuid: 'estimate-1',
        session_id: sessionId,
        estimated_tokens: 12,
        estimated_tokens_delta: 4,
        ...change,
      }),
    ).rejects.toThrow();
    expect(f.facts.some((fact) => fact.kind === 'usage' || fact.kind === 'outcome')).toBe(false);
  });
  it.each(['run_in_background', 'dangerouslyDisableSandbox'])(
    'refuses %s even when native permissions did not call the host',
    async (field) => {
      const f = fixture();
      await expect(
        f.assistant('msg-background', [
          {
            type: 'tool_use',
            id: 'tool-bg',
            name: 'Bash',
            input: { command: 'echo test', [field]: true },
          },
        ]),
      ).rejects.toThrow();
      expect(f.facts.some((fact) => fact.kind === 'outcome')).toBe(false);
      await f.protocol.end();
      expect(f.facts.at(-1)).toMatchObject({ kind: 'lost' });
    },
  );
  it('classifies the installed CLI quota result without publishing native diagnostic prose', async () => {
    const f = fixture();
    await f.accept({
      type: 'assistant',
      uuid: 'error_1',
      session_id: sessionId,
      error: 'rate_limit',
      message: { id: 'msg_error', content: [{ type: 'text', text: 'private diagnostic' }] },
    });
    await f.result({
      is_error: true,
      terminal_reason: 'api_error',
      stop_reason: 'stop_sequence',
      api_error_status: 429,
      result: 'private diagnostic',
      usage: { input_tokens: 0, output_tokens: 0 },
    });
    expect(f.facts.at(-1)).toEqual({
      kind: 'outcome',
      outcome: 'failed',
      error: {
        code: 'PROVIDER_FAILED',
        message: 'Claude quota or rate limit prevented the operation.',
      },
    });
    expect(JSON.stringify(f.facts)).not.toContain('private diagnostic');
  });
  it('separates commentary, reasoning and final without counting partial/message usage twice', async () => {
    const f = fixture();
    await f.assistant('msg_1', [
      { type: 'text', text: 'Checking' },
      { type: 'thinking', thinking: 'Reason' },
    ]);
    await f.assistant('msg_2', [{ type: 'text', text: 'Answer' }]);
    await f.result({
      result: 'Answer',
      usage: { input_tokens: 10, output_tokens: 4, cache_read_input_tokens: 2 },
    });
    expect(f.facts.filter((x) => x.kind === 'text').map((x) => [x.channel, x.text])).toEqual([
      ['reasoning', 'Reason'],
      ['commentary', 'Checking'],
      ['answer', 'Answer'],
    ]);
    expect(f.facts.filter((x) => x.kind === 'usage')).toEqual([
      {
        kind: 'usage',
        sampleId: 'claude-result',
        basis: 'turn-total',
        counters: { inputTokens: 10, outputTokens: 4, cachedTokens: 2 },
      },
    ]);
    expect(f.facts.at(-1)).toEqual({ kind: 'outcome', outcome: 'completed' });
  });
  it('correlates compound actions and independently settles their result state', async () => {
    const f = fixture();
    await f.assistant('msg_tools', [
      { type: 'tool_use', id: 'tool_a', name: 'Read', input: { file_path: 'a.ts' } },
      { type: 'tool_use', id: 'tool_b', name: 'Grep', input: { pattern: 'value' } },
    ]);
    await f.accept({
      type: 'user',
      message: {
        content: [
          { type: 'tool_result', tool_use_id: 'tool_b', content: 'missing', is_error: true },
          { type: 'tool_result', tool_use_id: 'tool_a', content: 'contents' },
        ],
      },
    });
    await f.result({ result: 'Done' });
    expect(f.facts.filter((x) => x.kind === 'action-open')).toHaveLength(2);
    expect(f.facts.filter((x) => x.kind === 'action-update').map((x) => [x.key, x.state])).toEqual([
      ['tool:tool_b', 'failed'],
      ['tool:tool_a', 'completed'],
    ]);
    expect(f.facts.filter((x) => x.kind === 'work-update')).toContainEqual({
      kind: 'work-update',
      key: 'tools:msg_tools',
      state: 'failed',
    });
  });
  it('deduplicates identical native messages and rejects changed duplicates and cross-session correlation', async () => {
    const f = fixture();
    await f.assistant('msg_1', [{ type: 'thinking', thinking: 'Reason' }]);
    const count = f.facts.length;
    await f.assistant('msg_1', [{ type: 'thinking', thinking: 'Reason' }]);
    expect(f.facts).toHaveLength(count);
    await expect(f.assistant('msg_1', [{ type: 'text', text: 'changed' }])).rejects.toThrow(
      'supported protocol',
    );
    await expect(
      f.accept({ type: 'system', subtype: 'status', session_id: 'other' }),
    ).rejects.toThrow('supported protocol');
  });
  it('never interprets prose, an unknown result subtype or successful OS exit as success', async () => {
    const f = fixture();
    await f.assistant('msg_1', [{ type: 'text', text: 'Success!' }]);
    await f.protocol.end();
    expect(f.facts.at(-1)).toEqual({
      kind: 'lost',
      message: 'Claude ended without an authoritative result.',
    });
    expect(f.facts.filter((x) => x.kind === 'outcome')).toEqual([]);
    const other = fixture();
    await expect(other.result({ subtype: 'new_success' })).rejects.toThrow('supported protocol');
    await expect(fixture().accept('not JSON object')).rejects.toThrow('supported protocol');
  });
  it('does not expose private native error details and refuses successful result with unfinished tools', async () => {
    const f = fixture();
    await f.result({ subtype: 'error_during_execution', is_error: true, errors: ['secret-value'] });
    expect(JSON.stringify(f.facts)).not.toContain('secret-value');
    expect(f.facts.at(-1)).toMatchObject({ kind: 'outcome', outcome: 'failed' });
    const open = fixture();
    await open.assistant('msg_1', [{ type: 'tool_use', id: 'tool_a', name: 'Read', input: {} }]);
    await expect(open.result()).rejects.toThrow('supported protocol');
  });
  it('splits multibyte output on character boundaries and holds back input under persistence backpressure', async () => {
    const facts: DriverFact[] = [];
    let unblock!: () => void;
    const blocked = new Promise<void>((resolve) => {
      unblock = resolve;
    });
    const protocol = createClaudeProtocol(async (fact) => {
      await blocked;
      validateDriverFact(fact);
      facts.push(fact);
    }, sessionId);
    const value = '💬'.repeat(20000);
    const first = protocol.accept(
      JSON.stringify({
        type: 'result',
        session_id: sessionId,
        subtype: 'success',
        is_error: false,
        result: value,
      }),
    );
    await expect(protocol.accept('{}')).rejects.toThrow('supported protocol');
    expect(facts).toHaveLength(0);
    unblock();
    await first;
    const chunks = facts.filter((x) => x.kind === 'text');
    expect(chunks.every((x) => Buffer.byteLength(x.text) <= 16384)).toBe(true);
    expect(chunks.map((x) => x.text).join('')).toBe(value);
    await protocol.accept('{invalid late frame');
    expect(facts.at(-1)).toEqual({ kind: 'outcome', outcome: 'completed' });
  });
  it('bounds malformed frames, correlation maps and numerical usage', async () => {
    await expect(fixture().protocol.accept(' '.repeat(1024 * 1024 + 1))).rejects.toThrow(
      'supported protocol',
    );
    await expect(fixture().result({ usage: { input_tokens: -1 } })).rejects.toThrow(
      'supported protocol',
    );
    const f = fixture();
    for (let i = 0; i < 4096; i++) {
      await f.accept({ type: 'system', subtype: 'status', uuid: 'event_' + i });
    }

    await expect(f.accept({ type: 'system', subtype: 'status', uuid: 'overflow' })).rejects.toThrow(
      'supported protocol',
    );
  });
  it('accepts distinct tool envelopes sharing one API message and rejects unsupported background work', async () => {
    const f = fixture();
    for (const id of ['a', 'b']) {
      await f.accept({
        type: 'assistant',
        uuid: 'event_' + id,
        session_id: sessionId,
        message: {
          id: 'msg_shared',
          content: [{ type: 'tool_use', id: 'tool_' + id, name: 'Read', input: {} }],
        },
      });
    }

    expect(f.facts.filter((fact) => fact.kind === 'action-open')).toHaveLength(2);
    await f.accept({
      type: 'user',
      message: {
        content: [
          { type: 'tool_result', tool_use_id: 'tool_b', content: 'b' },
          { type: 'tool_result', tool_use_id: 'tool_a', content: 'a' },
        ],
      },
    });
    await f.result({ result: 'Done' });
    expect(f.facts.at(-1)).toEqual({ kind: 'outcome', outcome: 'completed' });
    await expect(fixture().accept({ type: 'system', subtype: 'task_started' })).rejects.toThrow(
      'supported protocol',
    );
    await expect(
      fixture().accept({ type: 'assistant', message: { id: 'missing_uuid', content: [] } }),
    ).rejects.toThrow('supported protocol');
  });
  it.each(['aborted_streaming', 'aborted_tools'])(
    'preserves native %s as interruption instead of completion',
    async (reason) => {
      const f = fixture();
      await f.result({ terminal_reason: reason, result: 'Partial answer' });
      expect(f.facts.at(-1)).toMatchObject({ kind: 'outcome', outcome: 'interrupted' });
      expect(f.facts.some((fact) => fact.kind === 'text' && fact.channel === 'answer')).toBe(false);
      await expect(fixture().result({ terminal_reason: 'future_unknown' })).rejects.toThrow(
        'supported protocol',
      );
    },
  );
  it('joins text siblings sharing one API message into one final answer', async () => {
    const f = fixture();
    for (const [uuid, text] of [
      ['a', 'First '],
      ['b', 'second'],
    ]) {
      await f.accept({
        type: 'assistant',
        uuid,
        message: { id: 'msg_shared', content: [{ type: 'text', text }] },
      });
    }

    await f.result({ terminal_reason: 'completed', stop_reason: null });
    expect(f.facts.filter((fact) => fact.kind === 'text')).toEqual([
      { kind: 'text', key: 'answer', channel: 'answer', text: 'First second' },
    ]);
  });
});
