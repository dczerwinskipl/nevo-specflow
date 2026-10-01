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

export type HttpRequestConfig<TBody = unknown> = AxiosRequestConfig<TBody>;

export interface HttpClient {
  readonly axios: AxiosInstance;

  request<TResponse = unknown, TBody = unknown>(
    config: HttpRequestConfig<TBody>,
  ): Promise<TResponse>;

  get<TResponse = unknown>(
    url: string,
    config?: HttpRequestConfig<never>,
  ): Promise<TResponse>;

  delete<TResponse = unknown>(
    url: string,
    config?: HttpRequestConfig<never>,
  ): Promise<TResponse>;

  post<TResponse = unknown, TBody = unknown>(
    url: string,
    body?: TBody,
    config?: HttpRequestConfig<TBody>,
  ): Promise<TResponse>;

  put<TResponse = unknown, TBody = unknown>(
    url: string,
    body?: TBody,
    config?: HttpRequestConfig<TBody>,
  ): Promise<TResponse>;

  patch<TResponse = unknown, TBody = unknown>(
    url: string,
    body?: TBody,
    config?: HttpRequestConfig<TBody>,
  ): Promise<TResponse>;
}
