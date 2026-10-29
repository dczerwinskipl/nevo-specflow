import {
  isHttpClientError,
  type HttpRequestClient,
  type HttpRequestOptions,
} from '@nevo/http-client';
import { ApiError } from './ApiError';
import { classifyHttpError } from './classify';
import type { ErrorCodeTable } from './codes/common';

export interface ApiRequestOptions<TParams = unknown> extends HttpRequestOptions<TParams> {
  /** Overrides the transport's operation name for this call (`specs.create.inspect`). */
  readonly operation?: string;
  /** Rejects an answer of the wrong shape as a `protocol` error instead of crashing a render. */
  readonly isValid?: (data: unknown) => boolean;
}

/** Typed Runtime access whose every failure is an {@link ApiError} (or the original cancellation). */
export interface ApiTransport {
  get<T = unknown, TParams = unknown>(
    url: string,
    options?: ApiRequestOptions<TParams>,
  ): Promise<T>;
  delete<T = unknown, TParams = unknown>(
    url: string,
    options?: ApiRequestOptions<TParams>,
  ): Promise<T>;
  post<T = unknown, TBody = unknown, TParams = unknown>(
    url: string,
    body?: TBody,
    options?: ApiRequestOptions<TParams>,
  ): Promise<T>;
  put<T = unknown, TBody = unknown, TParams = unknown>(
    url: string,
    body?: TBody,
    options?: ApiRequestOptions<TParams>,
  ): Promise<T>;
  patch<T = unknown, TBody = unknown, TParams = unknown>(
    url: string,
    body?: TBody,
    options?: ApiRequestOptions<TParams>,
  ): Promise<T>;
}

export interface ApiTransportContext {
  /** Default operation name of the calls made through this transport. */
  readonly operation: string;
  readonly codes?: ErrorCodeTable;
  /** Connectivity probe; defaults to `navigator.onLine`. Injectable for tests. */
  readonly isOnline?: () => boolean;
}

const browserOnline = () => typeof navigator === 'undefined' || navigator.onLine !== false;

/**
 * Wraps the protected Runtime client (which already owns 401 recovery) with the product's error
 * classification. Mutations are never retried here. A mutation attempted while the browser reports
 * no connection fails before dispatch with `outcome: 'not-applied'`, the only case where a
 * network failure proves that nothing was sent.
 */
export function createApiTransport(
  http: HttpRequestClient,
  context: ApiTransportContext,
): ApiTransport {
  const isOnline = context.isOnline ?? browserOnline;

  async function run<T, TParams>(
    method: string,
    options: ApiRequestOptions<TParams> | undefined,
    send: (forwarded: HttpRequestOptions<TParams>) => Promise<T>,
  ): Promise<T> {
    const operation = options?.operation ?? context.operation;
    const isRead = method === 'GET' || method === 'HEAD';
    if (!isRead && !isOnline()) {
      throw new ApiError({ kind: 'network', operation, outcome: 'not-applied', retryable: true });
    }

    // `operation` and `isValid` are transport-level and must not reach the HTTP client.
    const { operation: _operation, isValid: _isValid, ...forwarded } = options ?? {};
    let data: T;
    try {
      data = await send(forwarded);
    } catch (error) {
      if (!isHttpClientError(error)) {
        throw error;
      }

      throw classifyHttpError(error, { operation, method, codes: context.codes });
    }

    if (options?.isValid && !options.isValid(data)) {
      throw new ApiError({
        kind: 'protocol',
        operation,
        outcome: isRead ? 'not-applied' : 'unknown',
        retryable: false,
      });
    }

    return data;
  }

  return {
    get: (url, options) => run('GET', options, (config) => http.get(url, config)),
    delete: (url, options) => run('DELETE', options, (config) => http.delete(url, config)),
    post: (url, body, options) => run('POST', options, (config) => http.post(url, body, config)),
    put: (url, body, options) => run('PUT', options, (config) => http.put(url, body, config)),
    patch: (url, body, options) => run('PATCH', options, (config) => http.patch(url, body, config)),
  };
}
