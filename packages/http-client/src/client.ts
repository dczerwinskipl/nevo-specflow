import axios, { AxiosHeaders, type AxiosResponse } from 'axios';

import { anonymousCredentials } from './credentials';
import { isHttpClientError, normalizeHttpError } from './errors';
import type { HttpClient, HttpClientOptions, HttpRequestConfig } from './types';

export function createHttpClient(options: HttpClientOptions = {}): HttpClient {
  const instance = axios.create({
    baseURL: options.baseURL,
    timeout: options.timeoutMs ?? 10_000,
    headers: options.headers,
    allowAbsoluteUrls: options.allowAbsoluteUrls ?? options.baseURL === undefined,
  });

  const credentials = options.credentials ?? anonymousCredentials();

  instance.interceptors.request.use(async (config) => {
    const resolved = await credentials.resolve({
      method: config.method,
      url: config.url,
    });

    if (!resolved) {
      return config;
    }

    if (resolved.withCredentials !== undefined) {
      config.withCredentials = resolved.withCredentials;
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
        >(config);
        return response.data;
      });
    },

    async get<TResponse, TParams>(
      url: string,
      config?: HttpRequestConfig<unknown, TParams>,
    ): Promise<TResponse> {
      return execute(async () => {
        const response = await instance.get<
          TResponse,
          AxiosResponse<TResponse, unknown, unknown, TParams>,
          unknown,
          TParams
        >(url, config);
        return response.data;
      });
    },

    async delete<TResponse, TParams>(
      url: string,
      config?: HttpRequestConfig<unknown, TParams>,
    ): Promise<TResponse> {
      return execute(async () => {
        const response = await instance.delete<
          TResponse,
          AxiosResponse<TResponse, unknown, unknown, TParams>,
          unknown,
          TParams
        >(url, config);
        return response.data;
      });
    },

    async post<TResponse, TBody, TParams>(
      url: string,
      body?: TBody,
      config?: HttpRequestConfig<TBody, TParams>,
    ): Promise<TResponse> {
      return execute(async () => {
        const response = await instance.post<
          TResponse,
          AxiosResponse<TResponse, TBody, unknown, TParams>,
          TBody,
          TParams
        >(url, body, config);
        return response.data;
      });
    },

    async put<TResponse, TBody, TParams>(
      url: string,
      body?: TBody,
      config?: HttpRequestConfig<TBody, TParams>,
    ): Promise<TResponse> {
      return execute(async () => {
        const response = await instance.put<
          TResponse,
          AxiosResponse<TResponse, TBody, unknown, TParams>,
          TBody,
          TParams
        >(url, body, config);
        return response.data;
      });
    },

    async patch<TResponse, TBody, TParams>(
      url: string,
      body?: TBody,
      config?: HttpRequestConfig<TBody, TParams>,
    ): Promise<TResponse> {
      return execute(async () => {
        const response = await instance.patch<
          TResponse,
          AxiosResponse<TResponse, TBody, unknown, TParams>,
          TBody,
          TParams
        >(url, body, config);
        return response.data;
      });
    },
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
