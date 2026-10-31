import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { request as httpRequest, Server as HttpServer } from 'node:http';
import type { DriverFact } from '../../persistence/protocol';
import { createMcpQuestionTransport, McpQuestionTransportLimits } from './question-transport';

type Bridge = Awaited<ReturnType<typeof createMcpQuestionTransport>>;
const bridges = new Set<Bridge>();
afterEach(async () => {
  await Promise.all([...bridges].map((bridge) => bridge.close()));
  bridges.clear();
});

async function fixture(
  active = true,
  emit?: (fact: DriverFact) => Promise<void>,
  revalidate?: (signal: AbortSignal) => Promise<void>,
) {
  const facts: DriverFact[] = [];
  const controller = new AbortController();
  const bridge: Bridge = await createMcpQuestionTransport({
    invocation: { sessionId: randomUUID(), turnId: randomUUID(), invocationId: randomUUID() },
    signal: controller.signal,
    routes: revalidate
      ? {
          '/permission': async (_envelope, response) => {
            try {
              const answer = await bridge.requestInteraction({
                keyPrefix: 'permission',
                interaction: {
                  kind: 'permission',
                  prompt: 'Allow?',
                  actionSummary: 'Controlled command',
                },
                response,
                revalidate,
                encodeResponse: () => JSON.stringify({ decision: 'allow' }),
              });
              response.writeHead(200, { 'content-type': 'application/json' });
              response.end(answer);
            } catch {
              response.writeHead(403);
              response.end();
            }
          },
        }
      : undefined,
    emit: (fact) => {
      facts.push(fact);

      return emit?.(fact) ?? Promise.resolve();
    },
  });
  bridges.add(bridge);
  const config = {
    serverUrl: bridge.endpoint.baseUrl + '/mcp',
    headers: { Authorization: bridge.endpoint.authorization },
  };
  const headers: Record<string, string> = {
    Authorization: config.headers.Authorization,
    Accept: 'application/json, text/event-stream',
    'Content-Type': 'application/json',
  };
  const post = (body: unknown, init: RequestInit = {}) =>
    fetch(config.serverUrl, {
      ...init,
      method: 'POST',
      headers: { ...headers, ...init.headers },
      body: JSON.stringify(body),
    });
  const initialized = await post({
    jsonrpc: '2.0',
    id: 0,
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'controlled-fixture', version: '1' },
    },
  });
  expect(initialized.status).toBe(200);
  await initialized.json();
  headers['mcp-session-id'] = initialized.headers.get('mcp-session-id')!;
  headers['mcp-protocol-version'] = '2025-06-18';
  expect((await post({ jsonrpc: '2.0', method: 'notifications/initialized' })).status).toBe(202);
  if (active) {
    bridge.activate();
  }

  const call = (id: number, args: unknown = { question: 'Which scope?' }, init?: RequestInit) =>
    post(
      {
        jsonrpc: '2.0',
        id,
        method: 'tools/call',
        params: { name: 'ask_user', arguments: args },
      },
      init,
    );
  const question = async (index = 0) => {
    await vi.waitFor(() =>
      expect(facts.filter((fact) => fact.kind === 'interaction').length).toBeGreaterThan(index),
    );

    return facts.filter((fact) => fact.kind === 'interaction')[index]!;
  };

  const permission = () =>
    fetch(bridge.endpoint.baseUrl + '/permission', {
      method: 'POST',
      headers,
      body: '{}',
    });

  return { bridge, controller, facts, config, headers, post, call, question, permission };
}

describe('invocation-private MCP question transport', () => {
  it('rejects a replacement MCP session and closes the Invocation instead of reusing request IDs', async () => {
    const f = await fixture();
    const response = await f.post(
      {
        jsonrpc: '2.0',
        id: 0,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'reconnect', version: '1' },
        },
      },
      { headers: { 'mcp-session-id': '' } },
    );
    expect(response.status).toBe(409);
    await f.bridge.done;
    expect(f.bridge.closed).toBe(true);
  });

  it('bounds stalled permission revalidation, aborts it and never retransmits after timeout', async () => {
    let validationSignal: AbortSignal | undefined;
    const stalled = Promise.withResolvers<void>();
    const f = await fixture(true, undefined, (signal) => {
      validationSignal = signal;

      return stalled.promise;
    });
    const native = f.permission();
    const interaction = await f.question();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const answer = {
        requestId: randomUUID(),
        kind: 'permission' as const,
        decision: 'allow' as const,
      };
      const responding = f.bridge.respond(interaction.key, answer);
      const failed = expect(responding).rejects.toMatchObject({ code: 'INTERACTION_EXPIRED' });
      await vi.advanceTimersByTimeAsync(McpQuestionTransportLimits.deliveryMs);
      await failed;
      expect(validationSignal?.aborted).toBe(true);
      await expect(f.bridge.respond(interaction.key, answer)).rejects.toMatchObject({
        code: 'INTERACTION_EXPIRED',
      });
      stalled.resolve();
      expect((await native).status).toBe(403);
    } finally {
      vi.useRealTimers();
    }
  });

  it('expires an unanswered MCP question after the bounded human response lifetime', async () => {
    const f = await fixture();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const native = f.call(1);
      const question = await f.question();
      await vi.advanceTimersByTimeAsync(McpQuestionTransportLimits.humanResponseMs);
      expect((await reply(await native)).error).toBeDefined();
      expect(f.facts.filter((fact) => fact.kind === 'interaction-expired')).toEqual([
        { kind: 'interaction-expired', key: question.key },
      ]);
      await expect(
        f.bridge.respond(question.key, {
          requestId: randomUUID(),
          kind: 'question',
          answer: { optionIds: [], text: 'Too late' },
        }),
      ).rejects.toMatchObject({ code: 'INTERACTION_EXPIRED' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('advertises only ask_user and does not activate question admission during initialization', async () => {
    const f = await fixture(false);
    const tools = await reply(await f.post({ jsonrpc: '2.0', id: 1, method: 'tools/list' }));
    expect(tools.result.tools.map((tool: { name: string }) => tool.name)).toEqual(['ask_user']);
    const rejected = await reply(await f.call(2));
    expect(rejected.error.message).toContain('not active');
    expect(f.facts).toEqual([]);
  });

  it('emits a canonical question, flushes one answer and preserves duplicate-response idempotency', async () => {
    const f = await fixture();
    const native = f.call(1, {
      question: 'Which scope?',
      options: [{ id: 'small', label: 'Small' }],
    });
    const question = await f.question();
    expect(question.interaction).toEqual({
      kind: 'question',
      prompt: 'Which scope?',
      allowText: true,
      options: [{ id: 'small', label: 'Small' }],
      maxSelections: 1,
    });
    const answer = {
      requestId: randomUUID(),
      kind: 'question' as const,
      answer: { optionIds: ['small'], text: 'Please keep it small.' },
    };
    const receipt = await f.bridge.respond(question.key, answer);
    expect(receipt.deliveredKeys).toEqual([question.key]);
    const result = await reply(await native);
    expect(JSON.parse(result.result.content[0]!.text)).toEqual({
      selections: [{ id: 'small', label: 'Small' }],
      text: 'Please keep it small.',
    });
    expect(await f.bridge.respond(question.key, answer)).toEqual(receipt);
    await expect(
      f.bridge.respond(question.key, { ...answer, answer: { optionIds: [], text: 'Changed' } }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    expect(f.facts).toHaveLength(1);
    expect(JSON.stringify(f.facts)).not.toContain(f.config.headers.Authorization);
  });

  it('rejects duplicate native request IDs without admitting or retransmitting another question', async () => {
    const f = await fixture();
    const native = f.call(1);
    const question = await f.question();
    expect((await f.call(1)).status).toBe(409);
    await f.bridge.respond(question.key, {
      requestId: randomUUID(),
      kind: 'question',
      answer: { optionIds: [], text: 'Original' },
    });
    await (await native).json();
    expect((await f.call(1)).status).toBe(409);
    expect(f.facts.filter((fact) => fact.kind === 'interaction')).toHaveLength(1);
  });

  it('isolates bearer credentials and rejects browser origins and a rebound Host', async () => {
    const f = await fixture();
    const other = await fixture();
    const body = { jsonrpc: '2.0', id: 1, method: 'tools/list' };
    expect((await f.post(body, { headers: { Authorization: 'Bearer invalid' } })).status).toBe(403);
    expect(
      (await f.post(body, { headers: { Authorization: other.config.headers.Authorization } }))
        .status,
    ).toBe(403);
    expect((await f.post(body, { headers: { Origin: 'https://untrusted.example' } })).status).toBe(
      403,
    );
    const rebound = await new Promise<number>((resolve, reject) => {
      const request = httpRequest(
        f.config.serverUrl,
        { method: 'POST', headers: { ...f.headers, Host: 'untrusted.example' } },
        (response) => {
          response.resume();
          resolve(response.statusCode!);
        },
      );
      request.once('error', reject);
      request.end(JSON.stringify(body));
    });
    expect(rebound).toBe(403);
    expect(f.facts).toEqual([]);
  });

  it('expires a disconnected pending call without claiming answer delivery or replaying it', async () => {
    const f = await fixture();
    const controller = new AbortController();
    const native = f.call(1, undefined, { signal: controller.signal });
    const rejected = expect(native).rejects.toThrow();
    const question = await f.question();
    controller.abort();
    await rejected;
    await vi.waitFor(() =>
      expect(f.facts).toContainEqual({ kind: 'interaction-expired', key: question.key }),
    );
    await expect(
      f.bridge.respond(question.key, {
        requestId: randomUUID(),
        kind: 'question',
        answer: { optionIds: [], text: 'Late' },
      }),
    ).rejects.toMatchObject({ code: 'INTERACTION_EXPIRED' });
    expect((await f.call(1)).status).toBe(409);
  });

  it('bounds pending calls and closes the listener and every outstanding question on invocation abort', async () => {
    const f = await fixture();
    const native = Array.from({ length: McpQuestionTransportLimits.pendingQuestions }, (_, index) =>
      f.call(index + 1).catch(() => undefined),
    );
    await f.question(McpQuestionTransportLimits.pendingQuestions - 1);
    expect((await reply(await f.call(100))).error.message).toContain('capacity');
    f.controller.abort();
    await f.bridge.done;
    await Promise.all(native);
    expect(f.facts.filter((fact) => fact.kind === 'interaction-expired')).toHaveLength(
      McpQuestionTransportLimits.pendingQuestions,
    );
    await expect(f.post({ jsonrpc: '2.0', id: 101, method: 'tools/list' })).rejects.toThrow();
    expect(() => f.bridge.activate()).toThrow();
  });

  it('rejects malformed, oversized and permission-shaped questions before canonical admission', async () => {
    const f = await fixture();
    let requestId = 1;
    for (const args of [
      { question: '' },
      { question: 'Approve?', decision: 'allow' },
      { question: '🙂'.repeat(3000) },
      {
        question: 'Pick',
        options: [
          { id: 'x', label: 'X' },
          { id: 'x', label: 'Y' },
        ],
      },
    ]) {
      expect((await reply(await f.call(requestId++, args))).error).toBeDefined();
    }

    const oversized = await fetch(f.config.serverUrl, {
      method: 'POST',
      headers: f.headers,
      body: 'x'.repeat(McpQuestionTransportLimits.requestBytes + 1),
    });
    expect(oversized.status).toBe(413);
    expect(f.facts).toEqual([]);
  });

  it('does not start a listener after abort during asynchronous protocol setup', async () => {
    const listen = vi.spyOn(HttpServer.prototype, 'listen');
    const controller = new AbortController();
    try {
      const starting = createMcpQuestionTransport({
        invocation: { sessionId: randomUUID(), turnId: randomUUID(), invocationId: randomUUID() },
        signal: controller.signal,
        emit: () => Promise.resolve(),
      });
      controller.abort();
      await expect(starting).rejects.toThrow();
      expect(listen).not.toHaveBeenCalled();
    } finally {
      listen.mockRestore();
    }
  });

  it('withholds native delivery until canonical question admission completes', async () => {
    let release!: () => void;
    const admission = new Promise<void>((resolve) => {
      release = resolve;
    });
    const f = await fixture(true, (fact) =>
      fact.kind === 'interaction' ? admission : Promise.resolve(),
    );
    const native = f.call(1);
    const question = await f.question();
    let delivered = false;
    const receipt = f.bridge
      .respond(question.key, {
        requestId: randomUUID(),
        kind: 'question',
        answer: { optionIds: [], text: 'Answer' },
      })
      .then((value) => {
        delivered = true;

        return value;
      });
    await Promise.resolve();
    expect(delivered).toBe(false);
    release();
    expect((await receipt).deliveredKeys).toEqual([question.key]);
    await (await native).json();
  });

  it('closes sockets independently of stalled expiry persistence and bounds cleanup failure', async () => {
    const f = await fixture(true, (fact) =>
      fact.kind === 'interaction-expired' ? new Promise<void>(() => undefined) : Promise.resolve(),
    );
    const native = f.call(1).catch(() => undefined);
    await f.question();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const closing = f.bridge.close();
      const closeFailure = expect(closing).rejects.toThrow('cleanup timed out');
      const doneFailure = expect(f.bridge.done).rejects.toThrow('cleanup timed out');
      await vi.advanceTimersByTimeAsync(McpQuestionTransportLimits.cleanupMs);
      await closeFailure;
      await doneFailure;
      bridges.delete(f.bridge);
    } finally {
      vi.useRealTimers();
    }

    await native;
    await expect(f.post({ jsonrpc: '2.0', id: 100, method: 'tools/list' })).rejects.toThrow();
  });
});

async function reply(response: Response) {
  return (await response.json()) as {
    result: { tools: { name: string }[]; content: { type: string; text: string }[] };
    error: { message: string };
  };
}
