import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { DriverFact } from '../../persistence/protocol';
import type { Invocation } from '../driver';
import { validateDriverFact } from '../facts';
import { createClaudeOperation, type ClaudeProcess } from './operation';
import { SessionError } from '../../errors';

function fixture(
  disposition: 'stopped' | 'unknown' = 'stopped',
  options: {
    disposeOnCancel?: boolean;
    launchDelay?: number;
    initializeError?: Error;
    verifyFrame?: (frame: Record<string, unknown>) => void;
  } = {},
) {
  const { disposeOnCancel = true, launchDelay = 0, initializeError } = options;
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
      if (frame.type === 'control_request') {
        push({
          type: 'control_response',
          response: {
            subtype: 'success',
            request_id: frame.request_id,
            response: { claude_code_version: '2.1.296' },
          },
        });
      }

      return Promise.resolve();
    },
    async *lines() {
      while (!ended) {
        if (!frames.length) {
          await new Promise<void>((resolve) => {
            wake = resolve;
          });
        }

        wake = undefined;
        const frame = frames.shift();
        if (frame !== undefined) {
          yield frame;
        }
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
    if (disposeOnCancel) {
      void owner.dispose();
    }
  });
  const operation = createClaudeOperation(
    invocation,
    (fact) => {
      validateDriverFact(fact);
      facts.push(fact);

      return Promise.resolve();
    },
    controller.signal,
    {
      launch: () =>
        launchDelay
          ? new Promise((resolve) => setTimeout(() => resolve(owner), launchDelay))
          : Promise.resolve(owner),
      initialize: () => {
        if (initializeError) {
          throw initializeError;
        }
      },
      verifyFrame: options.verifyFrame,
    },
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
  it('verifies native inventory before accepting a host permission or question request', async () => {
    const verifyFrame = vi.fn(() => {
      throw new Error('Inventory not verified');
    });
    const f = fixture('stopped', { verifyFrame });
    await f.ready();
    f.push(f.question());
    await f.operation.done;
    expect(verifyFrame).toHaveBeenCalledOnce();
    expect(f.facts.some((fact) => fact.kind === 'interaction')).toBe(false);
    expect(f.sent.some((frame) => frame.type === 'control_response')).toBe(false);
    expect(f.facts.at(-1)).toMatchObject({ kind: 'lost' });
  });
  it.each([true, false])(
    'preserves only sanitized initialization reasons: %s',
    async (sanitized) => {
      const error = sanitized
        ? new SessionError('MODEL_UNSUPPORTED', 'Requested Claude model is unavailable.')
        : new Error('Private native credential detail');
      const f = fixture('stopped', { initializeError: error });
      await f.operation.done;
      expect(f.beforeDispatch).not.toHaveBeenCalled();
      expect(f.facts.at(-1)).toMatchObject({
        kind: 'outcome',
        outcome: 'failed',
        error: {
          code: sanitized ? 'MODEL_UNSUPPORTED' : 'PROVIDER_UNAVAILABLE',
          message: sanitized
            ? 'Requested Claude model is unavailable.'
            : 'Claude could not initialize the requested operation.',
        },
      });
      expect(JSON.stringify(f.facts)).not.toContain('Private native credential detail');
    },
  );
  it('gives native initialization its own budget after a slow cold launch', async () => {
    vi.useFakeTimers();
    try {
      const f = fixture('stopped', { launchDelay: 11000 });
      await vi.advanceTimersByTimeAsync(11000);
      await f.ready();
      f.result();
      await f.operation.done;
      expect(f.facts.at(-1)).toEqual({ kind: 'outcome', outcome: 'completed' });
      expect(await f.operation.settlement).toMatchObject({
        process: 'stopped',
        source: 'native-result',
      });
    } finally {
      vi.useRealTimers();
    }
  });
  it('expires locally admitted answers when a native question group is cancelled before its write', async () => {
    const f = fixture();
    await f.ready();
    const frame = f.question();
    frame.request.input.questions.push({
      question: 'Second',
      options: [{ label: 'C' }],
      multiSelect: false,
    });
    f.push(frame);
    await vi.waitFor(() =>
      expect(f.facts.filter((fact) => fact.kind === 'interaction')).toHaveLength(2),
    );
    const keys = f.facts.filter((fact) => fact.kind === 'interaction').map((fact) => fact.key);
    expect(
      await f.operation.respond(keys[0]!, {
        requestId: randomUUID(),
        kind: 'question',
        answer: { optionIds: ['0'] },
      }),
    ).toEqual({ deliveredKeys: [] });
    f.push({ type: 'control_cancel_request', request_id: 'request_1' });
    await vi.waitFor(() =>
      expect(
        f.facts.filter((fact) => fact.kind === 'interaction-expired').map((fact) => fact.key),
      ).toEqual(keys),
    );
    expect(f.sent.filter((sent) => sent.type === 'control_response')).toHaveLength(0);
    f.result();
    await f.operation.done;
  });
  it('acknowledges an entire question group only after its single native write', async () => {
    const f = fixture();
    await f.ready();
    const frame = f.question();
    frame.request.input.questions.push({
      question: 'Second',
      options: [{ label: 'C' }],
      multiSelect: false,
    });
    f.push(frame);
    await vi.waitFor(() =>
      expect(f.facts.filter((fact) => fact.kind === 'interaction')).toHaveLength(2),
    );
    const keys = f.facts.filter((fact) => fact.kind === 'interaction').map((fact) => fact.key);
    const answer = {
      requestId: randomUUID(),
      kind: 'question' as const,
      answer: { optionIds: ['0'] },
    };
    expect(await f.operation.respond(keys[0]!, answer)).toEqual({ deliveredKeys: [] });
    expect(f.sent.filter((sent) => sent.type === 'control_response')).toHaveLength(0);
    expect(await f.operation.respond(keys[1]!, { ...answer, requestId: randomUUID() })).toEqual({
      deliveredKeys: keys,
    });
    expect(f.sent.filter((sent) => sent.type === 'control_response')).toHaveLength(1);
    f.result();
    await f.operation.done;
  });
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
  it('uses a native interrupt result and settles the tree before publishing cancellation evidence', async () => {
    const f = fixture('stopped', { disposeOnCancel: false });
    await f.ready();
    f.controller.abort();
    await vi.waitFor(() =>
      expect(
        f.sent.some((frame) => (frame.request as { subtype?: string })?.subtype === 'interrupt'),
      ).toBe(true),
    );
    expect(f.owner.dispose).not.toHaveBeenCalled();
    f.push({
      type: 'result',
      session_id: f.invocation.providerContext!.nativeSessionId,
      subtype: 'success',
      is_error: false,
      terminal_reason: 'aborted_streaming',
    });
    await f.operation.done;
    expect(await f.operation.settlement).toMatchObject({
      process: 'stopped',
      source: 'native-result',
      result: { outcome: 'interrupted' },
    });
    expect(f.facts.at(-1)).toMatchObject({ kind: 'outcome', outcome: 'interrupted' });
    expect(f.owner.dispose).toHaveBeenCalledOnce();
  });
  it('preserves a completed native result when cancellation races with completion', async () => {
    const f = fixture('stopped', { disposeOnCancel: false });
    await f.ready();
    f.result();
    f.controller.abort();
    await f.operation.done;
    expect(await f.operation.settlement).toMatchObject({
      source: 'native-result',
      result: { outcome: 'completed' },
    });
    expect(f.facts.at(-1)).toEqual({ kind: 'outcome', outcome: 'completed' });
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
