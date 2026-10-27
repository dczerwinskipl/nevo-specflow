import type { launchOwnedProcess } from '../process';

type Process = Pick<Awaited<ReturnType<typeof launchOwnedProcess>>, 'write' | 'lines' | 'dispose'>;
export type RpcId = number | string;
export interface RpcMessage {
  method: string;
  params: Record<string, unknown>;
  id?: RpcId;
}
export class CodexRpcError extends Error {
  readonly kind: 'protocol' | 'transport' | 'timeout' | 'cancelled' | 'capacity' | 'remote';
  readonly remoteCode?: number;
  constructor(kind: CodexRpcError['kind'], remoteCode?: number) {
    super('Codex transport could not complete the requested operation.');
    this.name = 'CodexRpcError';
    this.kind = kind;
    this.remoteCode = remoteCode;
  }
}
export function rpcObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new CodexRpcError('protocol');
  return value as Record<string, unknown>;
}
function id(value: unknown): RpcId {
  if (
    (typeof value === 'number' && Number.isSafeInteger(value)) ||
    (typeof value === 'string' && value.length > 0 && Buffer.byteLength(value) <= 256)
  )
    return value;
  throw new CodexRpcError('protocol');
}

/** One pull reader, bounded requests and writes. Message callbacks may persist facts
 * or reply, but must not await another client request (the reader owns its response).
 * Provider diagnostics never enter the request error exposed to the driver.
 */
export function createCodexRpc(
  process: Process,
  onMessage: (message: RpcMessage) => Promise<void>,
) {
  const pending = new Map<
    number,
    { resolve(value: unknown): void; reject(error: Error): void; cleanup(): void }
  >();
  let nextId = 0;
  let closed = false;
  let writes = Promise.resolve();
  let queued = 0;
  let queuedBytes = 0;
  function rejectAll(error: CodexRpcError) {
    for (const task of pending.values()) {
      task.cleanup();
      task.reject(error);
    }
    pending.clear();
  }
  async function write(frame: unknown, guard: () => boolean = () => true) {
    const line = JSON.stringify(frame) + '\n';
    const bytes = Buffer.byteLength(line);
    if (closed) throw new CodexRpcError('transport');
    if (queued >= 32 || queuedBytes + bytes > 1024 * 1024) throw new CodexRpcError('capacity');
    queued++;
    queuedBytes += bytes;
    const task = writes.then(async () => {
      if (closed) throw new CodexRpcError('transport');
      if (guard()) await process.write(line);
    });
    writes = task.catch(() => undefined);
    try {
      await task;
    } finally {
      queued--;
      queuedBytes -= bytes;
    }
  }
  const done = (async () => {
    try {
      for await (const line of process.lines()) {
        if (Buffer.byteLength(line) > 1024 * 1024) throw new CodexRpcError('protocol');
        const frame = rpcObject(JSON.parse(line));
        if (typeof frame.method === 'string') {
          if (frame.method.length > 128) throw new CodexRpcError('protocol');
          await onMessage({
            method: frame.method,
            params: frame.params === undefined ? {} : rpcObject(frame.params),
            ...(frame.id === undefined ? {} : { id: id(frame.id) }),
          });
        } else {
          const requestId = id(frame.id);
          if (typeof requestId !== 'number' || requestId < 1 || requestId > nextId)
            throw new CodexRpcError('protocol');
          const task = pending.get(requestId);
          if (!task) continue; // A timed-out request is never reused or redispatched.
          if (Object.hasOwn(frame, 'result') === Object.hasOwn(frame, 'error'))
            throw new CodexRpcError('protocol');
          const remote = Object.hasOwn(frame, 'error') ? rpcObject(frame.error) : undefined;
          pending.delete(requestId);
          task.cleanup();
          if (Object.hasOwn(frame, 'error')) {
            task.reject(
              new CodexRpcError(
                'remote',
                typeof remote?.code === 'number' ? remote.code : undefined,
              ),
            );
          } else task.resolve(frame.result);
        }
      }
      if (!closed) throw new CodexRpcError('transport');
    } catch (error) {
      throw error instanceof CodexRpcError ? error : new CodexRpcError('protocol');
    } finally {
      closed = true;
      rejectAll(new CodexRpcError('transport'));
    }
  })();
  void done.catch(() => undefined);
  let closing: Promise<Awaited<ReturnType<Process['dispose']>>> | undefined;
  return {
    done,
    request(
      method: string,
      params: Record<string, unknown>,
      signal: AbortSignal,
      timeoutMs = 10000,
    ): Promise<unknown> {
      if (closed || signal.aborted)
        return Promise.reject(new CodexRpcError(signal.aborted ? 'cancelled' : 'transport'));
      if (pending.size >= 16 || nextId >= Number.MAX_SAFE_INTEGER)
        return Promise.reject(new CodexRpcError('capacity'));
      if (
        !/^[A-Za-z][A-Za-z0-9/._-]{0,127}$/.test(method) ||
        !Number.isSafeInteger(timeoutMs) ||
        timeoutMs < 1 ||
        timeoutMs > 10000
      )
        return Promise.reject(new CodexRpcError('protocol'));
      const requestId = ++nextId;
      const result = new Promise<unknown>((resolve, reject) => {
        function fail(kind: CodexRpcError['kind']) {
          const task = pending.get(requestId);
          if (!task) return;
          pending.delete(requestId);
          task.cleanup();
          reject(new CodexRpcError(kind));
        }
        const abort = () => fail('cancelled');
        const timer = setTimeout(() => fail('timeout'), timeoutMs);
        timer.unref();
        pending.set(requestId, {
          resolve,
          reject,
          cleanup() {
            clearTimeout(timer);
            signal.removeEventListener('abort', abort);
          },
        });
        signal.addEventListener('abort', abort, { once: true });
        void write({ id: requestId, method, params }, () => pending.has(requestId)).catch(() =>
          fail('transport'),
        );
      });
      // Cancellation may race a caller attaching its continuation; keep an explicit owner.
      void result.catch(() => undefined);
      return result;
    },
    notify(method: string, params?: Record<string, unknown>) {
      return write({ method, ...(params ? { params } : {}) });
    },
    reply(requestId: RpcId, result: unknown, live?: () => boolean) {
      return write({ id: id(requestId), result }, live);
    },
    reject(requestId: RpcId) {
      return write({
        id: id(requestId),
        error: { code: -32601, message: 'Operation is outside the allowed Session capabilities.' },
      });
    },
    close() {
      closing ??= (async () => {
        closed = true;
        rejectAll(new CodexRpcError('cancelled'));
        const disposition = await process.dispose();
        await writes;
        await done.catch(() => undefined);
        return disposition;
      })();
      return closing;
    },
  };
}
