import { EventSourceParserStream } from 'eventsource-parser/stream';

import { HttpClientError } from './errors';
import type { CredentialProvider, SseEvent, SseRequestConfig, SseStream } from './types';

const DEFAULT_RETRY_MS = 3_000;
const MAX_BUFFER_SIZE = 16 * 1024 * 1024;

interface CreateSseStreamOptions<TEvent, TParams> {
  readonly url: string;
  readonly credentialUrl: string;
  readonly defaultHeaders?: Readonly<Record<string, string>>;
  readonly credentials: CredentialProvider;
  readonly config?: SseRequestConfig<TEvent, TParams>;
}

export function createSseStream<TEvent, TParams>(
  options: CreateSseStreamOptions<TEvent, TParams>,
): SseStream<TEvent> {
  const controller = new AbortController();
  const externalSignal = options.config?.signal;
  let lastEventId: string | undefined;
  let retryMs = DEFAULT_RETRY_MS;
  let consumed = false;
  let closed = false;

  const abortFromExternal = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) {
    abortFromExternal();
  } else {
    externalSignal?.addEventListener('abort', abortFromExternal, { once: true });
  }

  const close = () => {
    if (closed) {
      return;
    }

    closed = true;
    externalSignal?.removeEventListener('abort', abortFromExternal);
    controller.abort();
  };

  const stream: SseStream<TEvent> = {
    get lastEventId() {
      return lastEventId;
    },

    close,

    [Symbol.asyncIterator]() {
      if (consumed) {
        throw new Error('An SSE stream can only be consumed once.');
      }

      consumed = true;
      return iterate()[Symbol.asyncIterator]();
    },
  };

  return stream;

  async function* iterate(): AsyncGenerator<TEvent> {
    try {
      while (!controller.signal.aborted) {
        const resolvedCredentials = await options.credentials.resolve({
          method: 'get',
          url: options.credentialUrl,
        });

        if (controller.signal.aborted) {
          return;
        }

        const headers = new Headers();
        headers.set('Accept', 'text/event-stream');

        applyHeaders(headers, options.defaultHeaders);
        applyHeaders(headers, options.config?.headers);
        applyHeaders(headers, resolvedCredentials?.headers);

        if (lastEventId) {
          headers.set('Last-Event-ID', lastEventId);
        } else {
          headers.delete('Last-Event-ID');
        }

        let response: Response;
        try {
          response = await fetch(options.url, {
            method: 'GET',
            headers,
            signal: controller.signal,
            credentials: resolvedCredentials?.includeCookies ? 'include' : 'same-origin',
            cache: 'no-store',
          });
        } catch (error) {
          if (controller.signal.aborted) {
            return;
          }

          if (!(await waitBeforeReconnect(error))) {
            return;
          }
          continue;
        }

        if (response.status === 204) {
          return;
        }

        if (!response.ok) {
          throw new HttpClientError(
            `SSE request failed with HTTP ${response.status} ${response.statusText}.`.trim(),
            {
              kind: 'http',
              status: response.status,
              data: await readResponseBody(response),
            },
          );
        }

        const contentType = response.headers.get('content-type');
        if (!/^text\/event-stream(?:\s*;|$)/i.test(contentType ?? '')) {
          throw new HttpClientError('SSE response has an invalid Content-Type.', {
            kind: 'unexpected',
            status: response.status,
            data: contentType,
          });
        }

        if (!response.body) {
          throw new HttpClientError('SSE response has no readable body.', {
            kind: 'unexpected',
            status: response.status,
          });
        }

        options.config?.onConnected?.();

        let streamError: unknown;
        try {
          const parsedStream = response.body
            .pipeThrough(new TextDecoderStream())
            .pipeThrough(
              new EventSourceParserStream({
                maxBufferSize: MAX_BUFFER_SIZE,
                onId: (id) => {
                  lastEventId = id;
                },
                onRetry: (nextRetryMs) => {
                  retryMs = nextRetryMs;
                },
              }),
            );

          const reader = parsedStream.getReader();
          try {
            while (!controller.signal.aborted) {
              const { value, done } = await reader.read();
              if (done) {
                break;
              }

              const event: SseEvent = {
                type: value.event || 'message',
                data: value.data,
                ...(value.id === undefined ? {} : { id: value.id }),
              };

              yield options.config?.decode ? options.config.decode(event) : (event as TEvent);
            }
          } finally {
            reader.releaseLock();
          }
        } catch (error) {
          if (controller.signal.aborted) {
            return;
          }

          if (isFatalParserError(error)) {
            throw new HttpClientError('SSE parser exceeded its safe buffer limit.', {
              kind: 'unexpected',
              cause: error,
            });
          }

          streamError = error;
        }

        if (controller.signal.aborted) {
          return;
        }

        if (!(await waitBeforeReconnect(streamError))) {
          return;
        }
      }
    } finally {
      close();
    }
  }

  async function waitBeforeReconnect(error?: unknown): Promise<boolean> {
    options.config?.onReconnecting?.({
      error,
      retryInMs: retryMs,
    });

    return waitForDelay(retryMs, controller.signal);
  }
}

function applyHeaders(
  target: Headers,
  source: Readonly<Record<string, string>> | undefined,
): void {
  if (!source) {
    return;
  }

  for (const [name, value] of Object.entries(source)) {
    target.set(name, value);
  }
}

async function readResponseBody(response: Response): Promise<string | undefined> {
  try {
    const body = await response.text();
    return body || undefined;
  } catch {
    return undefined;
  }
}

function isFatalParserError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'type' in error &&
    (error as { type?: unknown }).type === 'max-buffer-size-exceeded'
  );
}

function waitForDelay(delayMs: number, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve(true);
    }, Math.max(0, delayMs));

    const onAbort = () => {
      clearTimeout(timeout);
      signal.removeEventListener('abort', onAbort);
      resolve(false);
    };

    signal.addEventListener('abort', onAbort, { once: true });
  });
}
