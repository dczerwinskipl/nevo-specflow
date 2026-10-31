import { describe, expect, it } from 'vitest';
import type { DriverFact } from '../../persistence/protocol';
import { validateDriverFact } from '../facts';
import { createCodexProtocol } from './protocol';
import { resolve } from 'node:path';

function fixture() {
  const facts: DriverFact[] = [];
  const protocol = createCodexProtocol(
    (fact) => {
      validateDriverFact(fact);
      facts.push(fact);

      return Promise.resolve();
    },
    'native-thread',
    true,
  );
  const send = (method: string, params: Record<string, unknown> = {}) =>
    protocol.accept({
      method,
      params: { threadId: 'native-thread', turnId: 'native-turn', ...params },
    });
  const start = () => send('turn/started', { turn: { id: 'native-turn', status: 'inProgress' } });
  const item = async (id: string, text: string, phase?: string) => {
    await send('item/started', {
      item: { id, type: 'agentMessage', text: '', ...(phase ? { phase } : {}) },
    });
    await send('item/agentMessage/delta', { itemId: id, delta: 'untrusted concatenation' });
    await send('item/completed', {
      item: { id, type: 'agentMessage', text, ...(phase ? { phase } : {}) },
    });
  };

  const finish = (status = 'completed', extra: Record<string, unknown> = {}) =>
    send('turn/completed', { turn: { id: 'native-turn', status, items: [], ...extra } });

  return { facts, protocol, send, start, item, finish };
}

it('maps the latest native context gauge independently of cumulative usage and compaction', async () => {
  const f = fixture();
  await f.start();
  for (const occupied of [400, 100]) {
    await f.send('thread/tokenUsage/updated', {
      tokenUsage: {
        total: { inputTokens: 9000 },
        last: { totalTokens: occupied },
        modelContextWindow: 2000,
      },
    });
  }

  const context = f.facts.filter(
    (fact) => fact.kind === 'measurement' && fact.metric === 'context',
  );
  expect(context.map((fact) => fact.value)).toEqual([
    { contextGeneration: expect.any(String) as string, occupiedTokens: 400, capacityTokens: 2000 },
    { contextGeneration: expect.any(String) as string, occupiedTokens: 100, capacityTokens: 2000 },
  ]);
  expect(JSON.stringify(context)).not.toContain('native-thread');
  expect(f.facts.filter((fact) => fact.kind === 'usage')).toHaveLength(2);
});

it('does not invent context occupancy from lifetime totals or missing last usage', async () => {
  const f = fixture();
  await f.start();
  await f.send('thread/tokenUsage/updated', { tokenUsage: { total: { inputTokens: 9000 } } });
  expect(f.facts.filter((fact) => fact.kind === 'measurement')).toEqual([]);
});

it('marks only the synthetic origin when a fresh native invocation stops before any measured usage', async () => {
  const f = fixture();
  await f.start();
  await f.protocol.end();
  expect(f.facts.filter((fact) => fact.kind === 'usage')).toEqual([
    {
      kind: 'usage',
      sampleId: 'native-baseline',
      baseline: true,
      basis: 'session-cumulative',
      counters: { inputTokens: 0, outputTokens: 0, cachedTokens: 0, reasoningTokens: 0 },
    },
  ]);
  expect(f.facts.at(-1)?.kind).toBe('lost');
});

describe('Codex authoritative native item normalization', () => {
  it('keeps phase-aware commentary/partial/final text separate and never repeats deltas', async () => {
    const f = fixture();
    await f.start();
    await f.item('one', 'Checking', 'commentary');
    await f.item('two', 'Intermediate', 'partial_answer');
    await f.item('three', 'Final', 'final_answer');
    await f.finish();
    expect(
      f.facts.filter((fact) => fact.kind === 'text').map((fact) => [fact.channel, fact.text]),
    ).toEqual([
      ['commentary', 'Checking'],
      ['commentary', 'Intermediate'],
      ['answer', 'Final'],
    ]);
    expect(f.facts.at(-1)).toEqual({ kind: 'outcome', outcome: 'completed' });
  });
  it('uses the last unknown-phase item as the answer only after successful completion', async () => {
    const f = fixture();
    await f.start();
    await f.item('one', 'Comment');
    await f.item('two', 'Answer');
    expect(f.facts.some((fact) => fact.kind === 'text' && fact.channel === 'answer')).toBe(false);
    await f.finish();
    expect(f.facts.filter((fact) => fact.kind === 'text').map((fact) => fact.text)).toEqual([
      'Comment',
      'Answer',
    ]);
  });
  it('preserves explicit failure and interruption, excluding private native error prose', async () => {
    const f = fixture();
    await f.start();
    await f.item('one', 'Partial');
    await f.finish('failed', {
      error: { message: 'private token/file error', codexErrorInfo: 'usageLimitExceeded' },
    });
    expect(f.facts.at(-1)).toMatchObject({
      kind: 'outcome',
      outcome: 'failed',
      error: { message: 'Codex quota or rate limit prevented the operation.' },
    });
    expect(JSON.stringify(f.facts)).not.toContain('private token/file error');
    const interrupted = fixture();
    await interrupted.start();
    await interrupted.finish('interrupted');
    expect(interrupted.facts.at(-1)).toEqual({ kind: 'outcome', outcome: 'interrupted' });
  });
  it('deduplicates native item identities but refuses changed duplicates, mismatched turns and unknown effectful items', async () => {
    const f = fixture();
    await f.start();
    const value = { id: 'one', type: 'reasoning', summary: ['Summary'] };
    await f.send('item/started', { item: value });
    await f.send('item/started', { item: value });
    await expect(
      f.send('item/started', { item: { ...value, summary: ['Changed'] } }),
    ).rejects.toThrow();
    await expect(f.send('item/completed', { turnId: 'other', item: value })).rejects.toThrow();
    await expect(
      f.send('item/started', { item: { id: 'write', type: 'fileChange' } }),
    ).rejects.toThrow();
  });
  it('keeps a compound command one evidenced action instead of inventing output/status for parsed shell fragments', async () => {
    const f = fixture();
    await f.start();
    const command = {
      id: 'cmd',
      type: 'commandExecution',
      command: 'read a | search b',
      commandActions: [{ type: 'read' }, { type: 'search' }],
      status: 'inProgress',
    };
    await f.send('item/started', { item: command });
    await f.send('item/completed', {
      item: {
        ...command,
        status: 'completed',
        exitCode: 0,
        aggregatedOutput: 'Native combined output',
      },
    });
    await f.finish();
    expect(f.facts.filter((fact) => fact.kind === 'action-open')).toHaveLength(1);
    expect(f.facts).toContainEqual({
      kind: 'text',
      key: 'action:cmd',
      channel: 'tool-output',
      text: 'Native combined output',
    });
  });
  it('records native cumulative totals from a known fresh baseline and deduplicates repeated totals', async () => {
    const f = fixture();
    await f.start();
    const tokenUsage = {
      total: { inputTokens: 10, outputTokens: 4, cachedInputTokens: 2, reasoningOutputTokens: 1 },
      last: { inputTokens: 10, outputTokens: 4 },
    };
    await f.send('thread/tokenUsage/updated', { tokenUsage });
    await f.send('thread/tokenUsage/updated', { tokenUsage });
    const usage = f.facts.filter((fact) => fact.kind === 'usage');
    expect(usage).toHaveLength(2);
    expect(usage[1]).toMatchObject({
      basis: 'session-cumulative',
      counters: { inputTokens: 10, outputTokens: 4, cachedTokens: 2, reasoningTokens: 1 },
    });
  });
  it('preserves provider-exposed reasoning content separately from numeric usage', async () => {
    const f = fixture();
    await f.start();
    await f.send('item/started', {
      item: { id: 'r', type: 'reasoning', summary: [], content: [] },
    });
    await f.send('item/completed', {
      item: {
        id: 'r',
        type: 'reasoning',
        summary: ['Summary'],
        content: ['Exposed reasoning text'],
      },
    });
    expect(f.facts.filter((fact) => fact.kind === 'text')).toEqual([
      {
        kind: 'text',
        key: 'item:r',
        channel: 'reasoning',
        text: 'Summary\nExposed reasoning text',
      },
    ]);
  });
  it('records one native patch and rejects changed completion targets or readonly mutation', async () => {
    const workspace = resolve('owned-workspace');
    async function run(writable: boolean, changed = false) {
      const facts: DriverFact[] = [];
      const protocol = createCodexProtocol(
        (fact) => {
          facts.push(fact);

          return Promise.resolve();
        },
        'thread',
        true,
        workspace,
        writable,
      );
      const send = (method: string, extra: Record<string, unknown>) =>
        protocol.accept({ method, params: { threadId: 'thread', turnId: 'turn', ...extra } });
      await send('turn/started', { turn: { id: 'turn', status: 'inProgress' } });
      const item = {
        id: 'patch',
        type: 'fileChange',
        changes: [{ path: 'file.txt', diff: '+text', kind: { type: 'add' } }],
      };
      await send('item/started', { item: { ...item, status: 'inProgress' } });
      expect(protocol.patchTargets('patch')).toEqual([resolve(workspace, 'file.txt')]);
      await send('item/completed', {
        item: {
          ...item,
          status: 'completed',
          ...(changed
            ? { changes: [{ path: '../outside', diff: '+text', kind: { type: 'add' } }] }
            : {}),
        },
      });

      return facts;
    }

    expect((await run(true)).filter((fact) => fact.kind === 'action-open')).toHaveLength(1);
    await expect(run(false)).rejects.toThrow();
    await expect(run(true, true)).rejects.toThrow();
  });
  it('bounds multibyte text chunks and treats missing outcome or premature completion as unknown', async () => {
    const f = fixture();
    await f.start();
    const answer = '💬'.repeat(18000);
    await f.item('one', answer);
    await f.finish();
    const chunks = f.facts
      .filter((fact) => fact.kind === 'text')
      .filter((fact) => fact.channel === 'answer');
    expect(chunks.every((fact) => Buffer.byteLength(fact.text) <= 16384)).toBe(true);
    expect(chunks.map((fact) => fact.text).join('')).toBe(answer);
    const lost = fixture();
    await lost.start();
    await lost.protocol.end();
    expect(lost.facts.at(-1)).toMatchObject({ kind: 'lost' });
    const premature = fixture();
    await premature.start();
    await premature.send('item/started', { item: { id: 'open', type: 'agentMessage', text: '' } });
    await expect(premature.finish()).rejects.toThrow();
  });
});
