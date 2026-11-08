import {
  isHttpClientError,
  type HttpRequestClient,
  type HttpRequestOptions,
  type HttpResponse,
  type HttpResponseOptions,
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

export interface ApiResponseOptions<TParams = unknown>
  extends HttpResponseOptions<TParams>, Pick<ApiRequestOptions<TParams>, 'operation' | 'isValid'> {}

/** Typed Runtime access whose every failure is an {@link ApiError} (or the original cancellation). */
export interface ApiTransport {
  get<T = unknown, TParams = unknown>(
    url: string,
    options?: ApiRequestOptions<TParams>,
  ): Promise<T>;
  /**
   * GET returning status and the requested headers; `304` is a result without `data`. `isValid`
   * applies to the body of a 2xx answer only.
   */
  getResponse<T = unknown, TParams = unknown>(
    url: string,
    options?: ApiResponseOptions<TParams>,
  ): Promise<HttpResponse<T>>;
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

  async function run<T, TParams, TOptions extends ApiRequestOptions<TParams>>(
    method: string,
    options: TOptions | undefined,
    send: (forwarded: Omit<TOptions, 'operation' | 'isValid'>) => Promise<T>,
    body: (result: T) => { readonly present: boolean; readonly data?: unknown } = (data) => ({
      present: true,
      data,
    }),
  ): Promise<T> {
    const operation = options?.operation ?? context.operation;
    const isRead = method === 'GET' || method === 'HEAD';
    if (!isRead && !isOnline()) {
      throw new ApiError({ kind: 'network', operation, outcome: 'not-applied', retryable: true });
    }

    // `operation` and `isValid` are transport-level and must not reach the HTTP client.
    const { operation: _operation, isValid: _isValid, ...forwarded } = options ?? ({} as TOptions);
    let data: T;
    try {
      data = await send(forwarded);
    } catch (error) {
      if (!isHttpClientError(error)) {
        throw error;
      }

      throw classifyHttpError(error, { operation, method, codes: context.codes });
    }

    const checked = body(data);
    if (options?.isValid && checked.present && !options.isValid(checked.data)) {
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
    getResponse: <T, TParams>(url: string, options?: ApiResponseOptions<TParams>) =>
      run(
        'GET',
        options,
        (config) => http.getResponse<T, TParams>(url, config),
        (response) => ({ present: response.status !== 304, data: response.data }),
      ),
    delete: (url, options) => run('DELETE', options, (config) => http.delete(url, config)),
    post: (url, body, options) => run('POST', options, (config) => http.post(url, body, config)),
    put: (url, body, options) => run('PUT', options, (config) => http.put(url, body, config)),
    patch: (url, body, options) => run('PATCH', options, (config) => http.patch(url, body, config)),
  };
}
