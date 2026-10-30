import { describe, expect, it } from 'vitest';
import type { DriverFact } from '../../persistence/protocol';
import { validateDriverFact } from '../facts';
import { createAntigravityProtocol, parseAntigravityFrame, parseAntigravityInit } from './protocol';

const id = 'native-conversation-1';
function fixture() {
  const facts: DriverFact[] = [];
  const protocol = createAntigravityProtocol((fact) => {
    validateDriverFact(fact);
    facts.push(fact);

    return Promise.resolve();
  }, id);
  const step = (index: number, fields: Record<string, unknown>) => ({
    event: 'step_update',
    step_update: { conversation_id: id, step_index: index, state: 'DONE', ...fields },
  });
  const result = (fields: Record<string, unknown> = {}) => ({
    event: 'result',
    result: { conversation_id: id, status: 'SUCCESS', response: 'Final answer', ...fields },
  });

  return { facts, protocol, step, result };
}

describe('Antigravity native stream protocol', () => {
  it('rejects a changed native tool identity within the same step', async () => {
    const { facts, protocol, step } = fixture();
    await protocol.frame(step(4, { step_type: 'tool', state: 'ACTIVE', tool_name: 'view_file' }));
    await expect(
      protocol.frame(step(4, { step_type: 'tool', tool_name: 'write_to_file' })),
    ).rejects.toThrow();
    expect(
      facts.filter((fact) => fact.kind === 'work-update' && fact.state === 'completed'),
    ).toEqual([]);
  });

  it('keeps late tool parameters and rejects conflicting replacements', async () => {
    const { facts, protocol, step } = fixture();
    await protocol.frame(step(4, { step_type: 'tool', state: 'ACTIVE', tool_name: 'view_file' }));
    await protocol.frame(
      step(4, {
        step_type: 'tool',
        tool_info: { parameters: { AbsolutePath: '/workspace/a' }, output: 'contents' },
      }),
    );
    expect(
      facts.filter((fact) => fact.kind === 'text' && fact.channel === 'tool-input'),
    ).toMatchObject([{ text: JSON.stringify({ AbsolutePath: '/workspace/a' }) }]);

    const other = fixture();
    await other.protocol.frame(
      other.step(2, {
        step_type: 'tool',
        state: 'ACTIVE',
        tool_name: 'view_file',
        tool_info: { parameters: { AbsolutePath: '/workspace/a' } },
      }),
    );
    await expect(
      other.protocol.frame(
        other.step(2, {
          step_type: 'tool',
          tool_name: 'view_file',
          tool_info: { parameters: { AbsolutePath: '/workspace/b' } },
        }),
      ),
    ).rejects.toThrow();
  });

  it('does not duplicate a long final candidate as commentary', async () => {
    const { facts, protocol, step, result } = fixture();
    const answer = 'ą'.repeat(35000);
    await protocol.frame(
      step(1, { step_type: 'agent_response', state: 'ACTIVE', text_delta: answer }),
    );
    await protocol.frame(step(1, { step_type: 'agent_response' }));
    await protocol.frame(result({ response: answer }));
    const text = facts.filter((fact) => fact.kind === 'text');
    expect(text.filter((fact) => fact.channel === 'commentary')).toEqual([]);
    expect(
      text
        .filter((fact) => fact.channel === 'answer')
        .map((fact) => fact.text)
        .join(''),
    ).toBe(answer);
    expect(text.every((fact) => Buffer.byteLength(fact.text) <= 16384)).toBe(true);
  });

  it('rejects an oversized final candidate without publishing a misleading prefix', async () => {
    const { facts, protocol, step } = fixture();
    await protocol.frame(
      step(1, { step_type: 'agent_response', state: 'ACTIVE', text_delta: 'a'.repeat(600000) }),
    );
    await expect(
      protocol.frame(
        step(1, { step_type: 'agent_response', state: 'ACTIVE', text_delta: 'b'.repeat(600000) }),
      ),
    ).rejects.toThrow();
    expect(facts.filter((fact) => fact.kind === 'text')).toEqual([]);
  });

  it('parses the pre-input identity and bounded effective configuration without inventing account identity', () => {
    expect(
      parseAntigravityInit(
        parseAntigravityFrame(
          JSON.stringify({
            event: 'init',
            conversation_id: id,
            init: {
              cwd: '/workspace',
              tools: ['view_file', 'write_to_file'],
              permission_mode: 'request-review',
              model: 'model-a',
            },
          }),
        ),
      ),
    ).toEqual({
      conversationId: id,
      cwd: '/workspace',
      tools: ['view_file', 'write_to_file'],
      permissionMode: 'request-review',
      model: 'model-a',
    });
    expect(() => parseAntigravityFrame('[]')).toThrow();
    expect(() => parseAntigravityFrame('{')).toThrow();
    expect(() =>
      parseAntigravityInit({
        event: 'init',
        conversation_id: id,
        init: { cwd: '/w', tools: ['x', 'x'], permission_mode: 'strict' },
      }),
    ).toThrow();
  });

  it('separates earlier commentary, actual thinking text, authoritative answer and cumulative numeric usage', async () => {
    const { facts, protocol, step, result } = fixture();
    await protocol.frame(step(1, { step_type: 'agent_response', text_delta: 'Checking files.' }));
    await protocol.frame(
      step(2, { step_type: 'thinking', text_delta: 'A provider supplied summary.' }),
    );
    await protocol.frame(
      step(3, { step_type: 'agent_response', state: 'ACTIVE', text_delta: 'Final ' }),
    );
    await protocol.frame(step(3, { step_type: 'agent_response', text_delta: 'answer' }));
    await protocol.frame(
      result({
        usage: { input_tokens: 12, output_tokens: 7, thinking_tokens: 3, cache_read_tokens: 2 },
      }),
    );
    expect(facts.filter((fact) => fact.kind === 'text')).toEqual([
      { kind: 'text', key: 'commentary:1', channel: 'commentary', text: 'Checking files.' },
      {
        kind: 'text',
        key: 'reasoning:2',
        channel: 'reasoning',
        text: 'A provider supplied summary.',
      },
      { kind: 'text', key: 'answer', channel: 'answer', text: 'Final answer' },
    ]);
    expect(facts).toContainEqual({
      kind: 'usage',
      sampleId: 'antigravity-result',
      basis: 'session-cumulative',
      counters: { inputTokens: 12, outputTokens: 7, reasoningTokens: 3, cachedTokens: 2 },
    });
    expect(facts).toContainEqual({
      kind: 'work-open',
      key: 'reasoning:2',
      workKind: 'reasoning',
      title: 'Antigravity reasoning',
    });
    expect(facts).toContainEqual({ kind: 'work-update', key: 'reasoning:2', state: 'completed' });
    expect(facts.at(-1)).toEqual({ kind: 'outcome', outcome: 'completed' });
  });

  it('preserves repeated incremental tokens and deduplicates only matching completed steps', async () => {
    const { facts, protocol, step, result } = fixture();
    await protocol.frame(
      step(1, { step_type: 'agent_response', state: 'ACTIVE', text_delta: 'ha' }),
    );
    await protocol.frame(
      step(1, { step_type: 'agent_response', state: 'ACTIVE', text_delta: 'ha' }),
    );
    const complete = step(1, { step_type: 'agent_response', text_delta: '!' });
    await protocol.frame(complete);
    await protocol.frame(complete);
    await protocol.frame(result({ response: '' }));
    expect(facts.filter((fact) => fact.kind === 'text')).toEqual([
      { kind: 'text', key: 'commentary:1', channel: 'commentary', text: 'haha!' },
    ]);
  });

  it('keeps native tool work bounded and rejects conflicting completed step replay', async () => {
    const { facts, protocol, step } = fixture();
    await protocol.frame(
      step(4, {
        step_type: 'tool',
        state: 'ACTIVE',
        tool_name: 'write_to_file',
        tool_info: { parameters: { TargetFile: '/workspace/file' } },
      }),
    );
    const complete = step(4, {
      step_type: 'tool',
      tool_name: 'write_to_file',
      tool_info: { output: 'Wrote file.' },
    });
    await protocol.frame(complete);
    const count = facts.length;
    await protocol.frame(complete);
    expect(facts).toHaveLength(count);
    expect(facts).toContainEqual({ kind: 'work-update', key: 'step:4', state: 'completed' });
    await expect(
      protocol.frame(
        step(4, {
          step_type: 'tool',
          tool_name: 'write_to_file',
          tool_info: { output: 'Changed replay.' },
        }),
      ),
    ).rejects.toThrow();
  });

  it('never turns a structured native error into success because it contains a plausible answer', async () => {
    const { facts, protocol, result } = fixture();
    await protocol.frame(
      result({ status: 'ERROR', response: 'A substantial answer', error: 'token=DO_NOT_PUBLISH' }),
    );
    expect(facts.at(-1)).toMatchObject({
      kind: 'outcome',
      outcome: 'failed',
      error: { code: 'PROVIDER_FAILED' },
    });
    expect(JSON.stringify(facts)).not.toContain('DO_NOT_PUBLISH');
    expect(facts).not.toContainEqual({ kind: 'outcome', outcome: 'completed' });
  });

  it('rejects wrong identities, unknown success statuses, malformed counters and contradictory terminal frames', async () => {
    for (const fields of [
      { conversation_id: 'wrong-id' },
      { status: 'probably-success' },
      { usage: { thinking_tokens: -1 } },
      { error: 'conflicting error' },
    ]) {
      const { protocol, result } = fixture();
      await expect(protocol.frame(result(fields))).rejects.toThrow();
    }

    const { protocol, step } = fixture();
    await expect(
      protocol.frame(step(1, { conversation_id: 'wrong', step_type: 'user_input' })),
    ).rejects.toThrow();
  });

  it('does not accept successful completion while native tool work remains active', async () => {
    const { facts, protocol, step, result } = fixture();
    await protocol.frame(
      step(4, { step_type: 'tool', state: 'ACTIVE', tool_name: 'run_command', tool_info: {} }),
    );
    await expect(protocol.frame(result())).rejects.toThrow();
    expect(facts.some((fact) => fact.kind === 'outcome')).toBe(false);
  });

  it('establishes a zero usage baseline only for a genuinely fresh native context', async () => {
    const { result } = fixture();
    for (const fresh of [false, true]) {
      const facts: DriverFact[] = [];
      const protocol = createAntigravityProtocol(
        (fact) => {
          facts.push(fact);

          return Promise.resolve();
        },
        id,
        fresh,
      );
      await protocol.frame(result({ usage: { input_tokens: 6 } }));
      const usage = facts.filter((fact) => fact.kind === 'usage');
      expect(usage).toHaveLength(fresh ? 2 : 1);
      if (fresh) {
        expect(usage[0]).toMatchObject({
          sampleId: 'antigravity-baseline',
          basis: 'session-cumulative',
          counters: { inputTokens: 0 },
        });
      }
    }
  });

  it('chunks Unicode content by UTF-8 budget without replacement characters', async () => {
    const { facts, protocol, result } = fixture();
    const answer = 'ą🙂'.repeat(10000);
    await protocol.frame(result({ response: answer }));
    const chunks = facts.filter(
      (fact): fact is Extract<DriverFact, { kind: 'text' }> => fact.kind === 'text',
    );
    expect(chunks.map((fact) => fact.text).join('')).toBe(answer);
    expect(chunks.every((fact) => Buffer.byteLength(fact.text) <= 16384)).toBe(true);
  });
});
