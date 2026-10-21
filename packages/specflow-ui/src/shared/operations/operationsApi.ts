import type { HttpRequestClient, SseEvent } from '@nevo/http-client';
import type { OperationKind, OperationProgressEvent } from '@nevo/specflow-contracts/operations';

/**
 * Port of the Runtime's generic long-running operation progress stream. Progress is a best-effort
 * display aid: the operation's own endpoint and inspection stay authoritative, and a stream that
 * fails or is unavailable must never fail the operation (callers just stop showing steps).
 */
export interface OperationsApi {
  /**
   * Yields the events of one operation (`snapshot` first, then steps) and ends after the terminal
   * event or when `signal` aborts. Reconnects with `Last-Event-ID` are handled by the SSE client.
   * May throw (stream refused, unauthorized, unsupported): callers treat that as "no progress".
   */
  watchProgress(
    kind: OperationKind,
    operationId: string,
    signal?: AbortSignal,
  ): AsyncIterable<OperationProgressEvent>;
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
  if (!isObject(data) || typeof data.type !== 'string' || !eventTypes.has(data.type))
    return undefined;
  if (data.type === 'snapshot' && !Array.isArray(data.steps)) return undefined;
  if (data.type === 'step' && (typeof data.step !== 'string' || typeof data.status !== 'string'))
    return undefined;
  return data as unknown as OperationProgressEvent;
}

export function createRuntimeOperationsApi(http: HttpRequestClient): OperationsApi {
  return {
    async *watchProgress(kind, operationId, signal) {
      const stream = http.sse<OperationProgressEvent | undefined>(
        `/api/operations/${encodeURIComponent(operationId)}/events?kind=${encodeURIComponent(kind)}`,
        { ...(signal ? { signal } : {}), decode: decodeProgressEvent },
      );
      try {
        for await (const event of stream) {
          if (signal?.aborted) return;
          if (!event) continue;
          yield event;
          // The server closes after a terminal event, and the SSE client would reconnect.
          if (
            event.type === 'completed' ||
            event.type === 'failed' ||
            event.type === 'recovery-required'
          )
            return;
        }
      } finally {
        stream.close();
      }
    },
  };
}
