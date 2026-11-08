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

it('changes the local context epoch only after confirmed compaction and fences protocol restarts', async () => {
  const f = fixture();
  await f.start();
  const sample = () =>
    f.send('thread/tokenUsage/updated', {
      tokenUsage: { total: { inputTokens: 9000 }, last: { totalTokens: 100 } },
    });
  await sample();
  await f.send('item/started', { item: { id: 'compact-1', type: 'contextCompaction' } });
  await sample();
  await f.send('item/completed', { item: { id: 'compact-1', type: 'contextCompaction' } });
  await sample();
  // Replayed completion must not advance a second time.
  await f.send('item/completed', { item: { id: 'compact-1', type: 'contextCompaction' } });
  await sample();
  const epochs = f.facts.flatMap((fact) =>
    fact.kind === 'measurement' && fact.metric === 'context' ? [fact.value.contextGeneration] : [],
  );
  expect(epochs[0]).toBe(epochs[1]);
  expect(epochs[2]).not.toBe(epochs[1]);
  expect(epochs[3]).toBe(epochs[2]);
  const other = fixture();
  await other.start();
  await other.send('thread/tokenUsage/updated', {
    tokenUsage: { total: { inputTokens: 9000 }, last: { totalTokens: 100 } },
  });
  const observed = other.facts.find(
    (fact) => fact.kind === 'measurement' && fact.metric === 'context',
  );
  expect(observed).toBeDefined();
  expect(JSON.stringify(observed)).not.toContain(epochs[0]);
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
    // Codex's parsed shell fragments never reclassify the one native command action.
    expect(f.facts.filter((fact) => fact.kind === 'action-open')).toEqual([
      {
        kind: 'action-open',
        key: 'action:cmd',
        parentKey: 'item:cmd',
        title: 'Command',
        operation: 'command',
      },
    ]);
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

    expect((await run(true)).filter((fact) => fact.kind === 'action-open')).toEqual([
      {
        kind: 'action-open',
        key: 'action:patch',
        parentKey: 'item:patch',
        title: 'Apply patch',
        operation: 'edit',
      },
    ]);
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

describe('Codex MCP tool call and web search items', () => {
  // Shapes follow the app-server v2 ThreadItem `mcpToolCall` and `webSearch` variants.
  const mcp = {
    id: 'mcp',
    type: 'mcpToolCall',
    server: 'docs',
    tool: 'lookup',
    arguments: { term: 'session' },
    appContext: null,
    mcpAppUi: null,
    pluginId: null,
    readOnlyHint: true,
    result: null,
    error: null,
    durationMs: null,
  };
  const search = { id: 'web', type: 'webSearch', query: '', action: null, results: null };
  const actionFacts = (facts: DriverFact[]) =>
    facts.filter((fact) =>
      ['work-open', 'work-update', 'action-open', 'action-update', 'text'].includes(fact.kind),
    );

  it('maps a completed MCP tool call to one `other` ToolAction with native input and result', async () => {
    const f = fixture();
    await f.start();
    await f.send('item/started', { item: { ...mcp, status: 'inProgress' } });
    await f.send('item/mcpToolCall/progress', { itemId: 'mcp', message: 'transient progress' });
    await f.send('item/completed', {
      item: {
        ...mcp,
        status: 'completed',
        result: {
          content: [{ type: 'text', text: 'Found' }],
          structuredContent: { hits: 1 },
          _meta: { private: true },
        },
        durationMs: 5,
      },
    });
    await f.finish();
    expect(actionFacts(f.facts)).toEqual([
      { kind: 'work-open', key: 'item:mcp', workKind: 'tool', title: 'Codex MCP tool call' },
      {
        kind: 'action-open',
        key: 'action:mcp',
        parentKey: 'item:mcp',
        title: 'docs/lookup',
        operation: 'other',
      },
      { kind: 'text', key: 'action:mcp', channel: 'tool-input', text: '{"term":"session"}' },
      {
        kind: 'text',
        key: 'action:mcp',
        channel: 'tool-output',
        text: '{"content":[{"type":"text","text":"Found"}],"structuredContent":{"hits":1}}',
      },
      { kind: 'action-update', key: 'action:mcp', state: 'completed' },
      { kind: 'work-update', key: 'item:mcp', state: 'completed' },
    ]);
    expect(f.facts.at(-1)).toEqual({ kind: 'outcome', outcome: 'completed' });
  });
  it('records a failed MCP tool call as failed and keeps the Turn running', async () => {
    const f = fixture();
    await f.start();
    await f.send('item/started', { item: { ...mcp, status: 'inProgress' } });
    await f.send('item/completed', {
      item: { ...mcp, status: 'failed', error: { message: 'tool unavailable' } },
    });
    await f.item('answer', 'Done anyway');
    await f.finish();
    expect(f.facts).toContainEqual({
      kind: 'text',
      key: 'action:mcp',
      channel: 'tool-output',
      text: 'tool unavailable',
    });
    expect(f.facts).toContainEqual({ kind: 'action-update', key: 'action:mcp', state: 'failed' });
    expect(f.facts).toContainEqual({ kind: 'work-update', key: 'item:mcp', state: 'failed' });
    expect(f.facts.at(-1)).toEqual({ kind: 'outcome', outcome: 'completed' });
  });
  it('refuses MCP tool calls without a bounded native identity or a terminal status', async () => {
    const f = fixture();
    await f.start();
    await expect(
      f.send('item/started', { item: { ...mcp, server: '', status: 'inProgress' } }),
    ).rejects.toThrow();
    const g = fixture();
    await g.start();
    await g.send('item/started', { item: { ...mcp, status: 'inProgress' } });
    await expect(
      g.send('item/completed', { item: { ...mcp, status: 'inProgress' } }),
    ).rejects.toThrow();
  });
  it('maps a web search to one `other` ToolAction whose query and results arrive on completion', async () => {
    const f = fixture();
    await f.start();
    await f.send('item/started', { item: search });
    const results = [{ title: 'Codex', url: 'https://example.com' }];
    await f.send('item/completed', {
      item: {
        ...search,
        query: 'codex app-server',
        action: { type: 'search', query: 'codex app-server', queries: null },
        results,
      },
    });
    await f.finish();
    expect(actionFacts(f.facts)).toEqual([
      { kind: 'work-open', key: 'item:web', workKind: 'tool', title: 'Codex web search' },
      {
        kind: 'action-open',
        key: 'action:web',
        parentKey: 'item:web',
        title: 'Web search',
        operation: 'other',
      },
      { kind: 'text', key: 'action:web', channel: 'tool-input', text: 'codex app-server' },
      { kind: 'text', key: 'action:web', channel: 'tool-output', text: JSON.stringify(results) },
      { kind: 'action-update', key: 'action:web', state: 'completed' },
      { kind: 'work-update', key: 'item:web', state: 'completed' },
    ]);
  });
  it('uses the structured action when a web search has no query and refuses unknown actions', async () => {
    const f = fixture();
    await f.start();
    await f.send('item/started', { item: search });
    const action = { type: 'openPage', url: 'https://example.com' };
    await f.send('item/completed', { item: { ...search, action } });
    expect(f.facts).toContainEqual({
      kind: 'text',
      key: 'action:web',
      channel: 'tool-input',
      text: JSON.stringify(action),
    });
    const g = fixture();
    await g.start();
    await g.send('item/started', { item: search });
    await expect(
      g.send('item/completed', { item: { ...search, action: { type: 'browse' } } }),
    ).rejects.toThrow();
  });
  it('leaves a web search open when the Turn fails, so settlement applies the terminal state', async () => {
    const f = fixture();
    await f.start();
    await f.send('item/started', { item: search });
    await f.finish('failed');
    expect(f.facts.some((fact) => fact.kind === 'action-update')).toBe(false);
    expect(f.facts.at(-1)).toMatchObject({ kind: 'outcome', outcome: 'failed' });
  });
  it('accepts a hosted web search that starts with an `other` action and completes with a query', async () => {
    const f = fixture();
    await f.start();
    await f.send('item/started', { item: { ...search, action: { type: 'other' } } });
    await f.send('item/completed', {
      item: { ...search, query: 'hosted', action: { type: 'search', query: 'hosted' } },
    });
    await f.finish();
    expect(f.facts.filter((fact) => fact.kind === 'text')).toEqual([
      { kind: 'text', key: 'action:web', channel: 'tool-input', text: 'hosted' },
    ]);
    expect(f.facts.at(-1)).toEqual({ kind: 'outcome', outcome: 'completed' });
  });
  it('refuses MCP completions with a changed identity or missing arguments, and mismatched streaming kinds', async () => {
    for (const changed of [{ tool: 'other' }, { arguments: undefined }]) {
      const f = fixture();
      await f.start();
      await f.send('item/started', { item: { ...mcp, status: 'inProgress' } });
      const completed: Record<string, unknown> = { ...mcp, status: 'completed', ...changed };
      if ('arguments' in changed) {
        delete completed.arguments;
      }

      await expect(f.send('item/completed', { item: completed })).rejects.toThrow();
    }

    const g = fixture();
    await g.start();
    await expect(
      g.send('item/started', {
        item: {
          id: 'no-args',
          type: 'mcpToolCall',
          server: 'docs',
          tool: 'x',
          status: 'inProgress',
        },
      }),
    ).rejects.toThrow();
    await g.send('item/started', { item: search });
    await expect(
      g.send('item/mcpToolCall/progress', { itemId: 'web', message: 'progress' }),
    ).rejects.toThrow();
    await g.send('item/started', { item: { ...mcp, status: 'inProgress' } });
    await expect(
      g.send('item/agentMessage/delta', { itemId: 'mcp', delta: 'text' }),
    ).rejects.toThrow();
  });
  it('still refuses ThreadItem types outside the accepted inventory', async () => {
    const f = fixture();
    await f.start();
    await expect(
      f.send('item/started', {
        item: { id: 'dyn', type: 'dynamicToolCall', tool: 'x', arguments: {} },
      }),
    ).rejects.toThrow();
  });
});
