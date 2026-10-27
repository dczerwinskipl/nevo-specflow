import { describe, expect, it, vi } from 'vitest';
import { createCodexRpc } from './rpc';

function fixture() {
  const sent: Record<string, unknown>[] = [];
  const incoming: string[] = [];
  const messages: unknown[] = [];
  let wake: (() => void) | undefined;
  let ended = false;
  const dispose = vi.fn(() => {
    ended = true;
    wake?.();
    return Promise.resolve({
      process: { state: 'stopped' as const, reason: 'tree-killed' as const },
      cleanup: [],
    });
  });
  const peer = createCodexRpc(
    {
      write(line) {
        sent.push(JSON.parse(line) as Record<string, unknown>);
        return Promise.resolve();
      },
      async *lines() {
        while (!ended) {
          if (!incoming.length)
            await new Promise<void>((resolve) => {
              wake = resolve;
            });
          wake = undefined;
          const line = incoming.shift();
          if (line !== undefined) yield line;
        }
      },
      dispose,
    },
    (message) => {
      messages.push(message);
      return Promise.resolve();
    },
  );
  const push = (value: unknown) => {
    incoming.push(JSON.stringify(value));
    wake?.();
  };
  return { peer, push, sent, messages, dispose };
}
describe('bounded Codex JSON RPC peer', () => {
  it('correlates out-of-order responses and routes notifications/server requests independently', async () => {
    const f = fixture();
    const signal = new AbortController().signal;
    const first = f.peer.request('initialize', {}, signal);
    const second = f.peer.request('model/list', {}, signal);
    await vi.waitFor(() => expect(f.sent).toHaveLength(2));
    f.push({ method: 'thread/status/changed', params: { threadId: 'thread' } });
    f.push({ id: 'ask', method: 'item/tool/requestUserInput', params: {} });
    f.push({ id: 2, result: { data: [] } });
    f.push({ id: 1, result: { userAgent: 'native' } });
    expect(await second).toEqual({ data: [] });
    expect(await first).toEqual({ userAgent: 'native' });
    expect(f.messages).toHaveLength(2);
    await f.peer.reply('ask', { answers: {} });
    expect(f.sent.at(-1)).toEqual({ id: 'ask', result: { answers: {} } });
    await Promise.all([f.peer.close(), f.peer.close()]);
    expect(f.dispose).toHaveBeenCalledOnce();
  });
  it('rejects bounded pending capacity and cleans every pending request on transport loss', async () => {
    const f = fixture();
    const signal = new AbortController().signal;
    const requests = Array.from({ length: 16 }, () => f.peer.request('model/list', {}, signal));
    await expect(f.peer.request('model/list', {}, signal)).rejects.toMatchObject({
      kind: 'capacity',
    });
    await f.peer.close();
    const settled = await Promise.allSettled(requests);
    expect(settled.every((result) => result.status === 'rejected')).toBe(true);
  });
  it('drops cancelled unsent requests and never reuses their identity for another dispatch', async () => {
    const f = fixture();
    const controller = new AbortController();
    const abandoned = f.peer.request('turn/start', {}, controller.signal);
    controller.abort();
    await expect(abandoned).rejects.toMatchObject({ kind: 'cancelled' });
    const next = f.peer.request('model/list', {}, new AbortController().signal);
    await vi.waitFor(() => expect(f.sent).toHaveLength(1));
    expect(f.sent[0]?.id).toBe(2);
    f.push({ id: 1, result: { late: true } });
    f.push({ id: 2, result: { data: [] } });
    await expect(next).resolves.toEqual({ data: [] });
    await f.peer.close();
  });
  it('exposes only structured remote error code, never private server messages or data', async () => {
    const f = fixture();
    const request = f.peer.request('thread/start', {}, new AbortController().signal);
    await vi.waitFor(() => expect(f.sent).toHaveLength(1));
    f.push({ id: 1, error: { code: 401, message: 'private-token', data: 'private-file' } });
    await expect(request).rejects.toMatchObject({
      kind: 'remote',
      remoteCode: 401,
      message: 'Codex transport could not complete the requested operation.',
    });
    await f.peer.close();
  });
  it('rejects malformed response without stranding the request that received it', async () => {
    const f = fixture();
    const request = f.peer.request('initialize', {}, new AbortController().signal);
    await vi.waitFor(() => expect(f.sent).toHaveLength(1));
    f.push({ id: 1, error: 'malformed' });
    await expect(request).rejects.toMatchObject({ kind: 'transport' });
    await expect(f.peer.done).rejects.toMatchObject({ kind: 'protocol' });
    await f.peer.close();
  });
  it('bounds response deadlines without treating late responses as another operation', async () => {
    vi.useFakeTimers();
    const f = fixture();
    try {
      const request = f.peer.request('turn/start', {}, new AbortController().signal, 100);
      await vi.advanceTimersByTimeAsync(100);
      await expect(request).rejects.toMatchObject({ kind: 'timeout' });
    } finally {
      await f.peer.close();
      vi.useRealTimers();
    }
  });
});
