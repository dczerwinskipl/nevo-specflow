import type { AxiosInstance, AxiosRequestConfig } from 'axios';

export type Awaitable<T> = T | Promise<T>;

export interface CredentialContext {
  readonly method?: string;
  readonly url?: string;
}

export interface ResolvedCredentials {
  readonly headers?: Readonly<Record<string, string>>;
  readonly withCredentials?: boolean;
}

export interface CredentialProvider {
  resolve(context: CredentialContext): Awaitable<ResolvedCredentials | undefined>;
}

export interface HttpClientOptions {
  readonly baseURL?: string;
  readonly timeoutMs?: number;
  readonly headers?: Readonly<Record<string, string>>;
  readonly credentials?: CredentialProvider;
  readonly allowAbsoluteUrls?: boolean;
}

export type HttpRequestConfig<TBody = unknown, TParams = unknown> = AxiosRequestConfig<
  TBody,
  TParams
>;

export interface HttpClient {
  readonly axios: AxiosInstance;

  request<TResponse = unknown, TBody = unknown, TParams = unknown>(
    config: HttpRequestConfig<TBody, TParams>,
  ): Promise<TResponse>;

  get<TResponse = unknown, TParams = unknown>(
    url: string,
    config?: HttpRequestConfig<unknown, TParams>,
  ): Promise<TResponse>;

  delete<TResponse = unknown, TParams = unknown>(
    url: string,
    config?: HttpRequestConfig<unknown, TParams>,
  ): Promise<TResponse>;

  post<TResponse = unknown, TBody = unknown, TParams = unknown>(
    url: string,
    body?: TBody,
    config?: HttpRequestConfig<TBody, TParams>,
  ): Promise<TResponse>;

  put<TResponse = unknown, TBody = unknown, TParams = unknown>(
    url: string,
    body?: TBody,
    config?: HttpRequestConfig<TBody, TParams>,
  ): Promise<TResponse>;

  patch<TResponse = unknown, TBody = unknown, TParams = unknown>(
    url: string,
    body?: TBody,
    config?: HttpRequestConfig<TBody, TParams>,
  ): Promise<TResponse>;
}
