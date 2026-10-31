import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { DriverFact } from '../../persistence/protocol';
import type { Invocation } from '../driver';
import { validateDriverFact } from '../facts';
import { createAntigravityOperation, type AntigravityProcess } from './operation';

function fixture(
  options: {
    disposition?: 'stopped' | 'unknown';
    resume?: boolean;
    beforeInput?: () => Promise<void>;
    dispatchValidation?: (signal: AbortSignal) => Promise<void>;
    nativeIdle?: (signal: AbortSignal) => Promise<void>;
    withoutInteractions?: boolean;
    nativeExitCode?: number;
    forcedSettlement?: boolean;
  } = {},
) {
  const facts: DriverFact[] = [];
  const writes: unknown[] = [];
  const frames: string[] = [];
  let ended = false;
  let naturalExit = false;
  let wake: (() => void) | undefined;
  const exit = Promise.withResolvers<{ code: number | null; signal: NodeJS.Signals | null }>();
  const push = (frame: unknown) => {
    frames.push(JSON.stringify(frame));
    wake?.();
  };

  const nativeId = 'native-conversation-1';
  const beforeDispatch = vi.fn(() => Promise.resolve());
  const beforeInput = vi.fn(options.beforeInput ?? (() => Promise.resolve()));
  const invocation: Invocation = {
    sessionId: randomUUID(),
    turnId: randomUUID(),
    invocationId: randomUUID(),
    request: { requestId: randomUUID(), message: 'Literal /command @file' },
    selection: {
      providerId: 'antigravity',
      mode: 'workspace-write',
      providerModeId: 'accept-edits',
    },
    executionContext: {
      kind: 'workspace-write',
      workspace: '/workspace',
      temporaryRoot: '/temp',
      workspaceIdentity: 'workspace-1',
      admission: { operationId: randomUUID(), scope: 'project' },
    },
    providerContext: {
      nativeSessionId: options.resume ? nativeId : randomUUID(),
      resume: options.resume ?? false,
    },
    beforeDispatch,
  };
  const owner: AntigravityProcess = {
    done: exit.promise,
    write(line) {
      writes.push(JSON.parse(line));

      return Promise.resolve();
    },
    endInput: vi.fn(() => {
      naturalExit = true;
      ended = true;
      wake?.();
      exit.resolve({ code: options.nativeExitCode ?? 0, signal: null });

      return Promise.resolve();
    }),
    async *lines() {
      while (!ended || frames.length) {
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
      exit.resolve({ code: 0, signal: null });

      return Promise.resolve({
        process: {
          state: options.disposition ?? 'stopped',
          reason:
            options.disposition === 'unknown'
              ? ('unverified-tree' as const)
              : naturalExit && !options.forcedSettlement
                ? ('group-exited' as const)
                : ('tree-killed' as const),
        },
        cleanup: [],
      });
    }),
  };
  const bridgeDone = Promise.withResolvers<void>();
  const bridge = {
    done: bridgeDone.promise,
    activate: vi.fn(),
    awaitNativeIdle: vi.fn(options.nativeIdle ?? (() => Promise.resolve())),
    respond: vi.fn((key: string) => Promise.resolve({ deliveredKeys: [key] })),
    close: vi.fn(() => {
      bridgeDone.resolve();

      return Promise.resolve();
    }),
  };
  const controller = new AbortController();
  const operation = createAntigravityOperation(
    invocation,
    (fact) => {
      validateDriverFact(fact);
      facts.push(fact);

      return Promise.resolve();
    },
    controller.signal,
    {
      launch: () =>
        Promise.resolve({
          owner,
          ...(!options.withoutInteractions ? { interactions: bridge } : {}),
        }),
      beforeInput,
      beforeDispatch: options.dispatchValidation,
    },
  );
  const init = (id = nativeId) =>
    push({
      event: 'init',
      conversation_id: id,
      init: { cwd: '/workspace', tools: ['view_file'], permission_mode: 'strict' },
    });
  const result = () =>
    push({
      event: 'result',
      result: { conversation_id: nativeId, status: 'SUCCESS', response: 'A short answer' },
    });
  const ready = () => vi.waitFor(() => expect(writes).toHaveLength(1));

  return {
    invocation,
    facts,
    writes,
    push,
    init,
    result,
    ready,
    operation,
    beforeDispatch,
    beforeInput,
    bridge,
    owner,
    controller,
  };
}

describe('Antigravity operation lifecycle', () => {
  it('passes the initialization deadline to dispatch validation and bounds an ignored abort', async () => {
    vi.useFakeTimers();
    const stalled = Promise.withResolvers<void>();
    let validationSignal: AbortSignal | undefined;
    try {
      const f = fixture({
        dispatchValidation: (signal) => {
          validationSignal = signal;

          return stalled.promise;
        },
      });
      f.init();
      await vi.waitFor(() => expect(validationSignal).toBeDefined());
      await vi.advanceTimersByTimeAsync(10000);
      await f.operation.done;
      expect(validationSignal?.aborted).toBe(true);
      expect(f.writes).toEqual([]);
      expect(await f.operation.settlement).toMatchObject({
        source: 'not-started',
        process: 'stopped',
      });
      stalled.resolve();
      await Promise.resolve();
      expect(f.writes).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
  it('bounds a stalled dispatch revalidation and never writes user input after expiry', async () => {
    const f = fixture();
    const stalled = Promise.withResolvers<void>();
    f.beforeDispatch.mockImplementation(() => stalled.promise);
    f.init();
    await vi.waitFor(() => expect(f.beforeDispatch).toHaveBeenCalledOnce());
    vi.useFakeTimers();
    try {
      // The initialization deadline was scheduled before fake timers: use the
      // operation cancellation path here, with a deliberately uncooperative port.
      f.controller.abort('user-cancel');
      await f.operation.done;
      expect(f.writes).toEqual([]);
      expect(await f.operation.settlement).toMatchObject({ source: 'not-started' });
      stalled.resolve();
      await Promise.resolve();
      expect(f.writes).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('drains post-result output without publishing extra execution facts', async () => {
    const f = fixture();
    f.init();
    await f.ready();
    f.result();
    // Exceeds ordinary pipe capacity; a native producer can require these reads
    // before it can exit. Trailing diagnostics need not be protocol frames.
    for (let index = 0; index < 64; index++) {
      f.push({ event: 'diagnostic', value: 'x'.repeat(8192) });
    }

    await f.operation.done;
    expect(await f.operation.settlement).toMatchObject({ source: 'native-result' });
    expect(f.facts.filter((fact) => fact.kind === 'outcome')).toHaveLength(1);
  });

  it('rejects unbounded post-result output rather than accepting success', async () => {
    const f = fixture();
    f.init();
    await f.ready();
    f.result();
    for (let index = 0; index < 5; index++) {
      f.push({ event: 'diagnostic', value: 'x'.repeat(1024 * 1024) });
    }

    await f.operation.done;
    expect(f.facts.at(-1)).toMatchObject({ kind: 'lost' });
    expect(f.facts.some((fact) => fact.kind === 'outcome')).toBe(false);
  });

  it('drains native input and waits for positive idle before publishing the result', async () => {
    const idle = Promise.withResolvers<void>();
    const f = fixture({ nativeIdle: () => idle.promise });
    f.init();
    await f.ready();
    f.result();
    await vi.waitFor(() => expect(f.owner.endInput).toHaveBeenCalledOnce());
    expect(f.bridge.awaitNativeIdle).toHaveBeenCalledOnce();
    expect(f.owner.dispose).not.toHaveBeenCalled();
    expect(f.facts.some((fact) => fact.kind === 'outcome')).toBe(false);
    idle.resolve();
    await f.operation.done;
    expect(await f.operation.settlement).toMatchObject({
      process: 'stopped',
      source: 'native-result',
      result: { outcome: 'completed' },
    });
  });

  it('does not accept a successful result without an idle transport', async () => {
    const f = fixture({ withoutInteractions: true });
    f.init();
    await f.ready();
    f.result();
    await f.operation.done;
    expect(await f.operation.settlement).toEqual({ process: 'stopped', source: 'unverified' });
    expect(f.facts.at(-1)).toMatchObject({ kind: 'lost' });
    expect(f.facts.some((fact) => fact.kind === 'outcome')).toBe(false);
  });

  it('does not accept a successful result when the idle receipt fails', async () => {
    const f = fixture({ nativeIdle: () => Promise.reject(new Error('idle request failed')) });
    f.init();
    await f.ready();
    f.result();
    await f.operation.done;
    expect(f.facts.at(-1)).toMatchObject({ kind: 'lost' });
    expect(f.facts.some((fact) => fact.kind === 'outcome')).toBe(false);
  });

  it('bounds missing idle evidence after a terminal frame without fabricating success', async () => {
    const f = fixture({
      nativeIdle: (signal) =>
        new Promise<void>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('idle aborted')), { once: true });
        }),
    });
    f.init();
    await f.ready();
    vi.useFakeTimers();
    try {
      f.result();
      await vi.waitFor(() => expect(f.bridge.awaitNativeIdle).toHaveBeenCalledOnce());
      await vi.advanceTimersByTimeAsync(5000);
      await f.operation.done;
      expect(f.facts.at(-1)).toMatchObject({ kind: 'lost' });
      expect(f.facts.some((fact) => fact.kind === 'outcome')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects a nominally successful result followed by a failed native exit', async () => {
    const f = fixture({ nativeExitCode: 1 });
    f.init();
    await f.ready();
    f.result();
    await f.operation.done;
    expect(f.facts.at(-1)).toMatchObject({ kind: 'lost' });
    expect(f.facts.some((fact) => fact.kind === 'outcome')).toBe(false);
  });

  it('does not accept a pending terminal success if cancellation races the idle receipt', async () => {
    const idle = Promise.withResolvers<void>();
    const f = fixture({ nativeIdle: () => idle.promise });
    f.init();
    await f.ready();
    f.result();
    await vi.waitFor(() => expect(f.bridge.awaitNativeIdle).toHaveBeenCalledOnce());
    f.controller.abort('user-cancel');
    await f.operation.done;
    idle.resolve();
    expect(await f.operation.settlement).toEqual({ process: 'stopped', source: 'forced-stop' });
    expect(f.facts.at(-1)).toMatchObject({ kind: 'lost' });
    expect(f.facts.some((fact) => fact.kind === 'outcome')).toBe(false);
  });

  it('bounds a missing graceful process exit even after receiving positive native idle', async () => {
    const f = fixture();
    vi.mocked(f.owner.endInput).mockResolvedValue(undefined);
    f.init();
    await f.ready();
    vi.useFakeTimers();
    try {
      f.result();
      await vi.waitFor(() => expect(f.bridge.awaitNativeIdle).toHaveBeenCalledOnce());
      await vi.advanceTimersByTimeAsync(5000);
      await f.operation.done;
      expect(await f.operation.settlement).toEqual({ process: 'stopped', source: 'forced-stop' });
      expect(f.facts.at(-1)).toMatchObject({ kind: 'lost' });
      expect(f.facts.some((fact) => fact.kind === 'outcome')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('preserves a failed native result after positive idle and its expected nonzero exit', async () => {
    const f = fixture({ nativeExitCode: 1 });
    f.init();
    await f.ready();
    f.push({
      event: 'result',
      result: { conversation_id: 'native-conversation-1', status: 'ERROR', response: '' },
    });
    await f.operation.done;
    expect(await f.operation.settlement).toMatchObject({
      process: 'stopped',
      source: 'native-result',
      result: { outcome: 'failed' },
    });
    expect(f.facts.at(-1)).toMatchObject({ kind: 'outcome', outcome: 'failed' });
  });

  it('does not settle success if surviving native children require forced termination', async () => {
    const f = fixture({ forcedSettlement: true });
    f.init();
    await f.ready();
    f.result();
    await f.operation.done;
    expect(await f.operation.settlement).toEqual({ process: 'stopped', source: 'forced-stop' });
    expect(f.facts.at(-1)).toMatchObject({ kind: 'lost' });
    expect(f.facts.some((fact) => fact.kind === 'outcome')).toBe(false);
  });

  it('validates native setup, persists actual context and dispatches exactly once before accepting questions', async () => {
    const f = fixture();
    expect(f.writes).toEqual([]);
    f.init();
    await f.ready();
    expect(f.beforeInput).toHaveBeenCalledOnce();
    expect(f.facts[0]).toEqual({ kind: 'correlation', providerSessionId: 'native-conversation-1' });
    expect(f.beforeDispatch).toHaveBeenCalledOnce();
    expect(f.bridge.activate).toHaveBeenCalledOnce();
    expect(f.writes).toEqual([{ event: 'user', message: { content: 'Literal /command @file' } }]);
    const response = {
      requestId: randomUUID(),
      kind: 'question' as const,
      answer: { optionIds: [], text: 'answer' },
    };
    expect(await f.operation.respond('question-1', response)).toEqual({
      deliveredKeys: ['question-1'],
    });
    f.result();
    await f.operation.done;
    expect(await f.operation.settlement).toMatchObject({
      process: 'stopped',
      source: 'native-result',
      result: { kind: 'outcome', outcome: 'completed' },
    });
    await expect(f.operation.respond('question-1', response)).rejects.toMatchObject({
      code: 'INTERACTION_EXPIRED',
    });
  });

  it('does not poison canonical context or dispatch if effective native setup fails validation', async () => {
    const f = fixture({ beforeInput: () => Promise.reject(new Error('policy rejected')) });
    f.init();
    await f.operation.done;
    expect(f.writes).toEqual([]);
    expect(f.facts.some((fact) => fact.kind === 'correlation')).toBe(false);
    expect(await f.operation.settlement).toMatchObject({
      process: 'stopped',
      source: 'not-started',
    });
  });

  it('rejects a replacement native context when resuming an existing Session', async () => {
    const f = fixture({ resume: true });
    f.init('replacement-context');
    await f.operation.done;
    expect(f.writes).toEqual([]);
    expect(f.beforeInput).not.toHaveBeenCalled();
    expect(f.facts.some((fact) => fact.kind === 'correlation')).toBe(false);
  });

  it('keeps a received terminal answer unknown when stopped-tree evidence is uncertain', async () => {
    const f = fixture({ disposition: 'unknown' });
    f.init();
    await f.ready();
    f.result();
    await f.operation.done;
    expect(await f.operation.settlement).toEqual({ process: 'unknown', source: 'unverified' });
    expect(f.facts.at(-1)).toMatchObject({ kind: 'lost' });
    expect(f.facts.some((fact) => fact.kind === 'outcome')).toBe(false);
  });

  it('does not fabricate cancellation after dispatched work is forced to stop without native result', async () => {
    const f = fixture();
    f.init();
    await f.ready();
    f.controller.abort('user-cancel');
    await f.operation.done;
    expect(await f.operation.settlement).toEqual({ process: 'stopped', source: 'forced-stop' });
    expect(f.facts.at(-1)).toMatchObject({ kind: 'lost' });
    expect(f.facts.some((fact) => fact.kind === 'outcome')).toBe(false);
  });

  it('treats an uncertain native stdin write as possibly dispatched work, never as safely retryable initialization', async () => {
    const f = fixture();
    vi.spyOn(f.owner, 'write').mockRejectedValue(new Error('stdin failed'));
    f.init();
    await f.operation.done;
    expect(await f.operation.settlement).toEqual({ process: 'stopped', source: 'unverified' });
    expect(f.facts.at(-1)).toMatchObject({ kind: 'lost' });
    expect(f.facts.some((fact) => fact.kind === 'outcome')).toBe(false);
  });

  it('does not infer a terminal result from EOF or process exit alone', async () => {
    const f = fixture();
    f.init();
    await f.ready();
    await f.owner.dispose();
    await f.operation.done;
    expect(await f.operation.settlement).toEqual({ process: 'stopped', source: 'unverified' });
    expect(f.facts.at(-1)).toMatchObject({ kind: 'lost' });
  });

  it('does not dispatch if cancellation races the durable dispatch barrier', async () => {
    const f = fixture();
    f.beforeDispatch.mockImplementation(() => {
      f.controller.abort('user-cancel');

      return Promise.resolve();
    });
    f.init();
    await f.operation.done;
    expect(f.writes).toEqual([]);
    expect(await f.operation.settlement).toMatchObject({
      process: 'stopped',
      source: 'not-started',
      result: { outcome: 'cancelled' },
    });
  });
});
