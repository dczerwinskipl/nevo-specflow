import axios, { AxiosHeaders, type AxiosRequestConfig, type AxiosResponse } from 'axios';

import { anonymousCredentials } from './credentials';
import { isHttpClientError, normalizeHttpError } from './errors';
import { createSseStream } from './sse';
import type {
  HttpClient,
  HttpClientOptions,
  HttpMethod,
  HttpRequestConfig,
  HttpRequestOptions,
  HttpResponse,
  HttpResponseOptions,
  SseEvent,
  SseRequestConfig,
  SseStream,
} from './types';

export function createHttpClient(options: HttpClientOptions = {}): HttpClient {
  const instance = axios.create({
    baseURL: options.baseURL,
    timeout: options.timeoutMs ?? 10_000,
    headers: options.headers,
    allowAbsoluteUrls: options.allowAbsoluteUrls ?? options.baseURL === undefined,
  });

  const credentials = options.credentials ?? anonymousCredentials();
  const mutationTimeoutMs = options.mutationTimeoutMs ?? 120_000;
  const mutation = { timeoutMs: mutationTimeoutMs };

  instance.interceptors.request.use(async (config) => {
    const resolved = await credentials.resolve({
      method: config.method ?? 'get',
      url: config.url ?? '',
    });

    if (!resolved) {
      return config;
    }

    if (resolved.includeCookies !== undefined) {
      config.withCredentials = resolved.includeCookies;
    }

    if (resolved.headers) {
      const headers = AxiosHeaders.from(config.headers);
      for (const [name, value] of Object.entries(resolved.headers)) {
        headers.set(name, value);
      }

      config.headers = headers;
    }

    return config;
  });

  return {
    axios: instance,

    async request<TResponse, TBody, TParams>(
      config: HttpRequestConfig<TBody, TParams>,
    ): Promise<TResponse> {
      return execute(async () => {
        const response = await instance.request<
          TResponse,
          AxiosResponse<TResponse, TBody, unknown, TParams>,
          TBody,
          TParams
        >({
          method: config.method,
          url: config.url,
          data: config.body,
          ...toAxiosConfig<TBody, TParams>(config, isRead(config.method) ? {} : mutation),
        });

        return response.data;
      });
    },

    async get<TResponse, TParams>(
      url: string,
      config?: HttpRequestOptions<TParams>,
    ): Promise<TResponse> {
      return execute(async () => {
        const response = await instance.get<
          TResponse,
          AxiosResponse<TResponse, unknown, unknown, TParams>,
          unknown,
          TParams
        >(url, toAxiosConfig<unknown, TParams>(config));

        return response.data;
      });
    },

    async getResponse<TResponse, TParams>(
      url: string,
      config?: HttpResponseOptions<TParams>,
    ): Promise<HttpResponse<TResponse>> {
      return execute(async () => {
        const response = await instance.get<
          TResponse,
          AxiosResponse<TResponse, unknown, unknown, TParams>,
          unknown,
          TParams
        >(url, {
          ...toAxiosConfig<unknown, TParams>(config),
          validateStatus: (status) => (status >= 200 && status < 300) || status === 304,
        });

        const headers = AxiosHeaders.from(response.headers as AxiosHeaders);
        const picked: Record<string, string> = {};
        for (const name of config?.responseHeaders ?? []) {
          const value = headers.get(name);
          if (typeof value === 'string') {
            picked[name.toLowerCase()] = value;
          }
        }

        return response.status === 304
          ? { status: response.status, headers: picked }
          : { status: response.status, data: response.data, headers: picked };
      });
    },

    async delete<TResponse, TParams>(
      url: string,
      config?: HttpRequestOptions<TParams>,
    ): Promise<TResponse> {
      return execute(async () => {
        const response = await instance.delete<
          TResponse,
          AxiosResponse<TResponse, unknown, unknown, TParams>,
          unknown,
          TParams
        >(url, toAxiosConfig<unknown, TParams>(config, mutation));

        return response.data;
      });
    },

    async post<TResponse, TBody, TParams>(
      url: string,
      body?: TBody,
      config?: HttpRequestOptions<TParams>,
    ): Promise<TResponse> {
      return execute(async () => {
        const response = await instance.post<
          TResponse,
          AxiosResponse<TResponse, TBody, unknown, TParams>,
          TBody,
          TParams
        >(url, body, toAxiosConfig<TBody, TParams>(config, mutation));

        return response.data;
      });
    },

    async put<TResponse, TBody, TParams>(
      url: string,
      body?: TBody,
      config?: HttpRequestOptions<TParams>,
    ): Promise<TResponse> {
      return execute(async () => {
        const response = await instance.put<
          TResponse,
          AxiosResponse<TResponse, TBody, unknown, TParams>,
          TBody,
          TParams
        >(url, body, toAxiosConfig<TBody, TParams>(config, mutation));

        return response.data;
      });
    },

    async patch<TResponse, TBody, TParams>(
      url: string,
      body?: TBody,
      config?: HttpRequestOptions<TParams>,
    ): Promise<TResponse> {
      return execute(async () => {
        const response = await instance.patch<
          TResponse,
          AxiosResponse<TResponse, TBody, unknown, TParams>,
          TBody,
          TParams
        >(url, body, toAxiosConfig<TBody, TParams>(config, mutation));

        return response.data;
      });
    },

    sse<TEvent = SseEvent, TParams = unknown>(
      url: string,
      config?: SseRequestConfig<TEvent, TParams>,
    ): SseStream<TEvent> {
      const resolvedUrl = instance.getUri({
        url,
        params: config?.params,
      });

      return createSseStream({
        url: resolvedUrl,
        credentialUrl: url,
        defaultHeaders: options.headers,
        credentials,
        config,
      });
    },
  };
}

function isRead(method: HttpMethod): boolean {
  return method === 'get' || method === 'head' || method === 'options';
}

/** `defaults.timeoutMs` (a mutation's deadline) applies unless the request sets its own. */
function toAxiosConfig<TBody, TParams>(
  config: HttpRequestOptions<TParams> | undefined,
  defaults: { readonly timeoutMs?: number } = {},
): AxiosRequestConfig<TBody, TParams> {
  const timeout = config?.timeoutMs ?? defaults.timeoutMs;
  if (!config) {
    return timeout === undefined ? {} : { timeout };
  }

  return {
    headers: config.headers,
    params: config.params,
    signal: config.signal,
    timeout,
  };
}

async function execute<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    if (isHttpClientError(error) || axios.isAxiosError(error)) {
      throw normalizeHttpError(error);
    }

    throw error;
  }
}
