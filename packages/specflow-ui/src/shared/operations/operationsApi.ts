import { isHttpClientError, type HttpRequestClient, type SseEvent } from '@nevo/http-client';
import type { OperationProgressEvent } from '@nevo/specflow-contracts/operations';
import { decodeOperationList, type OperationListResult } from './operationList';

export interface OperationListOptions {
  readonly signal?: AbortSignal;
  /** Entity tag of the list the caller already holds: the Runtime may answer 304 (`not-modified`). */
  readonly etag?: string;
}

/** The longest one list read may take; a slow answer is a failed read (the panel retries). */
const listTimeoutMs = 15_000;

/**
 * Port of the Runtime's generic long-running operation lists and progress streams. Progress is a best-effort
 * display aid: the operation's own endpoint and inspection stay authoritative, and a stream that
 * fails or is unavailable must never fail the operation (callers just stop showing steps).
 */
export interface OperationsApi {
  /**
   * Reads the list of operations a feature serves at `listUrl` (for Specifications
   * `/api/specs/operations`). A Runtime that does not serve it (404/403) is `unavailable`, not an
   * error: the panel stays hidden. Any other failure throws and is retried with backoff.
   */
  list(listUrl: string, options?: OperationListOptions): Promise<OperationListResult>;

  /**
   * Yields the events of one operation (`snapshot` first, then steps) from the stream at
   * `streamUrl` and ends after the terminal event or when `signal` aborts. The URL is built by the
   * owning feature's own API port (every feature owns the route of its operation); this port only
   * knows the event envelope. Reconnects with `Last-Event-ID` are handled by the SSE client.
   * May throw (stream refused, unauthorized, unsupported): callers treat that as "no progress".
   */
  watchProgress(streamUrl: string, signal?: AbortSignal): AsyncIterable<OperationProgressEvent>;
}

const eventTypes: ReadonlySet<string> = new Set([
  'snapshot',
  'step',
  'completed',
  'failed',
  'recovery-required',
]);

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/** Parses one SSE frame; anything that is not a well-formed event is dropped (undefined). */
export function decodeProgressEvent(frame: SseEvent): OperationProgressEvent | undefined {
  let data: unknown;
  try {
    data = JSON.parse(frame.data);
  } catch {
    return undefined;
  }

  if (!isObject(data) || typeof data.type !== 'string' || !eventTypes.has(data.type)) {
    return undefined;
  }

  if (data.type === 'snapshot' && !Array.isArray(data.steps)) {
    return undefined;
  }

  if (data.type === 'step' && (typeof data.step !== 'string' || typeof data.status !== 'string')) {
    return undefined;
  }

  return data as unknown as OperationProgressEvent;
}

export function createRuntimeOperationsApi(http: HttpRequestClient): OperationsApi {
  return {
    async list(listUrl, options = {}) {
      try {
        const data = await http.get<unknown>(listUrl, {
          ...(options.signal ? { signal: options.signal } : {}),
          ...(options.etag ? { headers: { 'If-None-Match': options.etag } } : {}),
          timeoutMs: listTimeoutMs,
        });
        const list = decodeOperationList(data);
        if (!list) {
          throw new Error('Operation list has an unexpected shape.');
        }

        return { kind: 'list', list };
      } catch (error) {
        if (isHttpClientError(error)) {
          if (error.status === 304) {
            return { kind: 'not-modified' };
          }

          if (error.status === 404 || error.status === 403 || error.status === 501) {
            return { kind: 'unavailable' };
          }
        }

        throw error;
      }
    },
    async *watchProgress(streamUrl, signal) {
      const stream = http.sse<OperationProgressEvent | undefined>(streamUrl, {
        ...(signal ? { signal } : {}),
        decode: decodeProgressEvent,
      });
      try {
        for await (const event of stream) {
          if (signal?.aborted) {
            return;
          }

          if (!event) {
            continue;
          }

          yield event;
          // The server closes after a terminal event, and the SSE client would reconnect.
          if (
            event.type === 'completed' ||
            event.type === 'failed' ||
            event.type === 'recovery-required'
          ) {
            return;
          }
        }
      } finally {
        stream.close();
      }
    },
  };
}
