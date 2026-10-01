import axios, { AxiosHeaders } from 'axios';

import { normalizeHttpError } from './errors.js';
import { anonymousCredentials } from './credentials.js';
import type { HttpClient, HttpClientOptions, HttpRequestConfig } from './types.js';

export function createHttpClient(options: HttpClientOptions = {}): HttpClient {
  const instance = axios.create({
    baseURL: options.baseURL,
    timeout: options.timeoutMs ?? 10_000,
    headers: options.headers,
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

  instance.interceptors.response.use(
    (response) => response,
    (error: unknown) => Promise.reject(normalizeHttpError(error)),
  );

  return {
    axios: instance,

    async request<TResponse, TBody>(config: HttpRequestConfig<TBody>): Promise<TResponse> {
      const response = await instance.request<TResponse, unknown, TBody>(config);
      return response.data;
    },

    async get<TResponse>(
      url: string,
      config?: HttpRequestConfig<never>,
    ): Promise<TResponse> {
      const response = await instance.get<TResponse>(url, config);
      return response.data;
    },

    async delete<TResponse>(
      url: string,
      config?: HttpRequestConfig<never>,
    ): Promise<TResponse> {
      const response = await instance.delete<TResponse>(url, config);
      return response.data;
    },

    async post<TResponse, TBody>(
      url: string,
      body?: TBody,
      config?: HttpRequestConfig<TBody>,
    ): Promise<TResponse> {
      const response = await instance.post<TResponse, unknown, TBody>(url, body, config);
      return response.data;
    },

    async put<TResponse, TBody>(
      url: string,
      body?: TBody,
      config?: HttpRequestConfig<TBody>,
    ): Promise<TResponse> {
      const response = await instance.put<TResponse, unknown, TBody>(url, body, config);
      return response.data;
    },

    async patch<TResponse, TBody>(
      url: string,
      body?: TBody,
      config?: HttpRequestConfig<TBody>,
    ): Promise<TResponse> {
      const response = await instance.patch<TResponse, unknown, TBody>(url, body, config);
      return response.data;
    },
  };
}
