import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { DriverFact } from '../../persistence/protocol';
import type { Invocation } from '../driver';
import { validateDriverFact } from '../facts';
import { createClaudeOperation, type ClaudeProcess } from './operation';

function fixture(disposition: 'stopped' | 'unknown' = 'stopped') {
  const facts: DriverFact[] = [];
  const sent: Record<string, unknown>[] = [];
  const frames: string[] = [];
  let wake: (() => void) | undefined;
  let ended = false;
  const push = (frame: unknown) => {
    frames.push(JSON.stringify(frame));
    wake?.();
  };
  const beforeDispatch = vi.fn(() => Promise.resolve());
  const invocation: Invocation = {
    sessionId: randomUUID(),
    turnId: randomUUID(),
    invocationId: randomUUID(),
    request: { requestId: randomUUID(), message: 'Literal @file /command' },
    selection: { providerId: 'claude', mode: 'read-only' },
    executionContext: { kind: 'no-effects' },
    providerContext: { nativeSessionId: randomUUID(), resume: false },
    beforeDispatch,
  };
  const owner: ClaudeProcess = {
    write(line) {
      const frame = JSON.parse(line) as Record<string, unknown>;
      sent.push(frame);
      if (frame.type === 'control_request')
        push({
          type: 'control_response',
          response: {
            subtype: 'success',
            request_id: frame.request_id,
            response: { claude_code_version: '2.1.296' },
          },
        });
      return Promise.resolve();
    },
    async *lines() {
      while (!ended) {
        if (!frames.length)
          await new Promise<void>((resolve) => {
            wake = resolve;
          });
        wake = undefined;
        const frame = frames.shift();
        if (frame !== undefined) yield frame;
      }
    },
    dispose: vi.fn(() => {
      ended = true;
      wake?.();
      return Promise.resolve({
        process: {
          state: disposition,
          reason:
            disposition === 'stopped' ? ('tree-killed' as const) : ('unverified-tree' as const),
        },
        cleanup: [],
      });
    }),
  };
  const controller = new AbortController();
  controller.signal.addEventListener('abort', () => {
    void owner.dispose();
  });
  const operation = createClaudeOperation(
    invocation,
    (fact) => {
      validateDriverFact(fact);
      facts.push(fact);
      return Promise.resolve();
    },
    controller.signal,
    { launch: () => Promise.resolve(owner), initialize: () => undefined },
  );
  const ready = () =>
    vi.waitFor(() => expect(sent.some((frame) => frame.type === 'user')).toBe(true));
  const result = () =>
    push({
      type: 'result',
      session_id: invocation.providerContext!.nativeSessionId,
      subtype: 'success',
      is_error: false,
      result: 'Answer',
    });
  const question = (id = 'request_1') => ({
    type: 'control_request',
    request_id: id,
    request: {
      subtype: 'can_use_tool',
      tool_name: 'AskUserQuestion',
      tool_use_id: 'tool_' + id,
      input: {
        questions: [
          { question: 'Choose', options: [{ label: 'A' }, { label: 'B' }], multiSelect: false },
        ],
      },
    },
  });
  return {
    facts,
    sent,
    invocation,
    operation,
    ready,
    push,
    result,
    question,
    controller,
    owner,
    beforeDispatch,
  };
}
describe('Claude bidirectional operation', () => {
  it('publishes only the safe quota reason into durable conversation before its failed outcome', async () => {
    const f = fixture();
    await f.ready();
    f.push({
      type: 'result',
      session_id: f.invocation.providerContext!.nativeSessionId,
      subtype: 'success',
      is_error: true,
      api_error_status: 429,
      terminal_reason: 'api_error',
      stop_reason: 'stop_sequence',
      result: 'private native diagnostic',
    });
    await f.operation.done;
    expect(f.facts).toContainEqual({
      kind: 'text',
      key: 'provider-error',
      channel: 'commentary',
      text: 'Claude quota or rate limit prevented the operation.',
    });
    expect(f.facts.at(-1)).toMatchObject({ kind: 'outcome', outcome: 'failed' });
    expect(JSON.stringify(f.facts)).not.toContain('private native diagnostic');
  });
  it('initializes before durable dispatch and publishes completion only after tree disposal', async () => {
    const f = fixture();
    await f.ready();
    expect(f.beforeDispatch).toHaveBeenCalledOnce();
    expect(f.sent[1]).toMatchObject({
      type: 'user',
      client_composed: true,
      message: { content: f.invocation.request.message },
    });
    f.result();
    await f.operation.done;
    expect(f.owner.dispose).toHaveBeenCalledOnce();
    expect(f.facts.at(-1)).toEqual({ kind: 'outcome', outcome: 'completed' });
  });
  it('keeps reading native cancellations while a question waits and sends no late response', async () => {
    const f = fixture();
    await f.ready();
    f.push(f.question());
    await vi.waitFor(() => expect(f.facts.some((fact) => fact.kind === 'interaction')).toBe(true));
    f.push({ type: 'control_cancel_request', request_id: 'request_1' });
    await vi.waitFor(() =>
      expect(f.facts.some((fact) => fact.kind === 'interaction-expired')).toBe(true),
    );
    await expect(
      f.operation.respond('question:request_1:0', {
        requestId: randomUUID(),
        kind: 'question',
        answer: { optionIds: ['0'] },
      }),
    ).rejects.toMatchObject({ code: 'INTERACTION_EXPIRED' });
    f.result();
    await f.operation.done;
    expect(f.sent.filter((frame) => frame.type === 'control_response')).toHaveLength(0);
  });
  it('deduplicates native questions, responds once and refuses mutation permissions', async () => {
    const f = fixture();
    await f.ready();
    f.push(f.question());
    f.push(f.question());
    await vi.waitFor(() =>
      expect(f.facts.filter((fact) => fact.kind === 'interaction')).toHaveLength(1),
    );
    await f.operation.respond('question:request_1:0', {
      requestId: randomUUID(),
      kind: 'question',
      answer: { optionIds: ['0'] },
    });
    f.push({
      type: 'control_request',
      request_id: 'write',
      request: { subtype: 'can_use_tool', tool_name: 'Write' },
    });
    await vi.waitFor(() =>
      expect(f.sent.filter((frame) => frame.type === 'control_response')).toHaveLength(2),
    );
    expect(f.sent.filter((frame) => frame.type === 'control_response')[1]).toMatchObject({
      response: { response: { behavior: 'deny' } },
    });
    f.result();
    await f.operation.done;
  });
  it('holds a successful result as unknown when process-tree settlement is unverified', async () => {
    const f = fixture('unknown');
    await f.ready();
    f.result();
    await f.operation.done;
    expect(f.facts.at(-1)).toMatchObject({ kind: 'lost' });
    expect(f.facts.some((fact) => fact.kind === 'outcome')).toBe(false);
  });
  it('cancels a pending question after positive tree settlement', async () => {
    const f = fixture();
    await f.ready();
    f.push(f.question());
    await vi.waitFor(() => expect(f.facts.some((fact) => fact.kind === 'interaction')).toBe(true));
    f.controller.abort();
    await f.operation.done;
    expect(f.facts.at(-1)).toEqual({ kind: 'outcome', outcome: 'cancelled' });
    expect(f.facts.some((fact) => fact.kind === 'interaction-expired')).toBe(true);
  });
  it('turns malformed post-dispatch protocol into unknown instead of fabricated failure', async () => {
    const f = fixture();
    await f.ready();
    f.push({ type: 'unsupported' });
    await f.operation.done;
    expect(f.facts.at(-1)).toMatchObject({ kind: 'lost' });
    expect(f.facts.some((fact) => fact.kind === 'outcome')).toBe(false);
  });
});
