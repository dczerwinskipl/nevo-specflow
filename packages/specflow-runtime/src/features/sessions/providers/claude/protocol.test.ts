import { describe, expect, it } from 'vitest';
import type { DriverFact } from '../../persistence/protocol';
import { validateDriverFact } from '../facts';
import { createClaudeProtocol } from './protocol';

const sessionId = 'b6d81fa6-d1fc-4841-8241-bc1ae33cbb1f';
function fixture() {
  const facts: DriverFact[] = [];
  const protocol = createClaudeProtocol((fact) => {
    validateDriverFact(fact);
    facts.push(fact);
    return Promise.resolve();
  }, sessionId);
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
    for (let i = 0; i < 4096; i++)
      await f.accept({ type: 'system', subtype: 'status', uuid: 'event_' + i });
    await expect(f.accept({ type: 'system', subtype: 'status', uuid: 'overflow' })).rejects.toThrow(
      'supported protocol',
    );
  });
  it('accepts distinct tool envelopes sharing one API message and rejects unsupported background work', async () => {
    const f = fixture();
    for (const id of ['a', 'b'])
      await f.accept({
        type: 'assistant',
        uuid: 'event_' + id,
        session_id: sessionId,
        message: {
          id: 'msg_shared',
          content: [{ type: 'tool_use', id: 'tool_' + id, name: 'Read', input: {} }],
        },
      });
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
    ])
      await f.accept({
        type: 'assistant',
        uuid,
        message: { id: 'msg_shared', content: [{ type: 'text', text }] },
      });
    await f.result({ terminal_reason: 'completed', stop_reason: null });
    expect(f.facts.filter((fact) => fact.kind === 'text')).toEqual([
      { kind: 'text', key: 'answer', channel: 'answer', text: 'First second' },
    ]);
  });
});
