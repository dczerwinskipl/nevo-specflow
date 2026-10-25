import { Worker } from 'node:worker_threads';
import { randomUUID } from 'node:crypto';
import { isAbsolute } from 'node:path';
import { SessionError } from '../errors';
import type { SessionErrorCode } from '@nevo/specflow-contracts/sessions';
import type { StoreCommand, WorkerReply, StoreReadMetrics } from './protocol';

export interface SessionStore {
  call<T>(this: void, command: StoreCommand): Promise<T>;
  close(): Promise<void>;
  /** Stop the worker without releasing durable ownership after uncertain shutdown. */
  abandon(): Promise<void>;
  readMetrics(): Readonly<StoreReadMetrics>;
}

/** Requests are asynchronous; DatabaseSync and all transcript data stay in the Worker. */
export async function openSessionStore(options: {
  directory: string;
  projectId: string;
}): Promise<SessionStore> {
  if (!isAbsolute(options.directory))
    throw new SessionError('SESSION_INPUT_INVALID', 'Session storage path must be absolute.');
  const source = import.meta.url.endsWith('.ts')
    ? new URL('../../../session-worker.ts', import.meta.url)
    : new URL('./session-worker.js', import.meta.url);
  const worker = new Worker(source, {
    execArgv: process.execArgv.filter((value) => !value.startsWith('--input-type')),
    workerData: { kind: 'session-store', ...options, runtimeId: randomUUID(), pid: process.pid },
  });
  const pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  let id = 0,
    closed = false,
    closing: Promise<void> | undefined;
  let metrics: StoreReadMetrics = { rows: 0, contentBytes: 0 };
  let readyResolve: () => void, readyReject: (error: Error) => void;
  const ready = new Promise<void>((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });
  const failure = (error: Error) => {
    closed = true;
    readyReject(error);
    for (const task of pending.values()) task.reject(error);
    pending.clear();
  };
  worker.on('error', () =>
    failure(new SessionError('SESSION_STORE_UNAVAILABLE', 'Session Worker failed.')),
  );
  worker.on('exit', () =>
    failure(new SessionError('SESSION_STORE_UNAVAILABLE', 'Session Worker closed.')),
  );
  worker.on('message', (message: WorkerReply) => {
    if (message.metrics) metrics = message.metrics;
    const error = message.error
      ? new SessionError(
          message.error.code as SessionErrorCode,
          message.error.message,
          message.error.details,
        )
      : undefined;
    if (message.id === 0) {
      if (error) readyReject(error);
      else readyResolve();
      return;
    }
    const task = pending.get(message.id);
    if (!task) return;
    pending.delete(message.id);
    if (error) task.reject(error);
    else task.resolve(message.result);
  });
  try {
    await ready;
  } catch (error) {
    await worker.terminate();
    throw error;
  }
  function call<T>(command: StoreCommand): Promise<T> {
    if (closed || (closing && command.op !== 'close'))
      return Promise.reject(
        new SessionError('SESSION_STORE_UNAVAILABLE', 'Session store is closed.'),
      );
    if (pending.size >= 64)
      return Promise.reject(
        new SessionError('SESSION_STORE_BUSY', 'Session storage queue is full.'),
      );
    return new Promise<T>((resolve, reject) => {
      const requestId = ++id;
      pending.set(requestId, { resolve: (value) => resolve(value as T), reject });
      worker.postMessage({ id: requestId, command });
    });
  }
  return {
    call,
    readMetrics: () => metrics,
    async abandon() {
      closed = true;
      await worker.terminate();
    },
    close() {
      closing ??= (async () => {
        try {
          await call({ op: 'close' });
        } finally {
          closed = true;
          await worker.terminate();
        }
      })();
      return closing;
    },
  };
}
