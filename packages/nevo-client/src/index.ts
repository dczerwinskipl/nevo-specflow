import axios, {
  AxiosError,
  AxiosHeaders,
  type AxiosInstance,
  type AxiosRequestConfig,
} from 'axios';

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

export type HttpErrorKind = 'cancelled' | 'http' | 'network' | 'unexpected';

export class HttpClientError extends Error {
  readonly kind: HttpErrorKind;
  readonly status?: number;
  readonly code?: string;
  readonly data?: unknown;

  constructor(
    message: string,
    options: {
      readonly kind: HttpErrorKind;
      readonly status?: number;
      readonly code?: string;
      readonly data?: unknown;
      readonly cause?: unknown;
    },
  ) {
    super(message, { cause: options.cause });
    this.name = 'HttpClientError';
    this.kind = options.kind;
    this.status = options.status;
    this.code = options.code;
    this.data = options.data;
  }
}

export function isHttpClientError(error: unknown): error is HttpClientError {
  return error instanceof HttpClientError;
}

export function normalizeHttpError(error: unknown): HttpClientError {
  if (error instanceof HttpClientError) {
    return error;
  }

  if (axios.isAxiosError(error)) {
    return normalizeAxiosError(error);
  }

  return new HttpClientError('Unexpected HTTP client error.', {
    kind: 'unexpected',
    cause: error,
  });
}

export function anonymousCredentials(): CredentialProvider {
  return {
    resolve: () => undefined,
  };
}

export function cookieCredentials(): CredentialProvider {
  return {
    resolve: () => ({ withCredentials: true }),
  };
}

export function bearerTokenCredentials(
  getAccessToken: () => Awaitable<string | null | undefined>,
): CredentialProvider {
  return {
    async resolve() {
      const token = await getAccessToken();
      if (!token) {
        return undefined;
      }

      return {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      };
    },
  };
}

export function customCredentials(
  resolve: (context: CredentialContext) => Awaitable<ResolvedCredentials | undefined>,
): CredentialProvider {
  return { resolve };
}

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

function normalizeAxiosError(error: AxiosError): HttpClientError {
  if (error.code === AxiosError.ERR_CANCELED) {
    return new HttpClientError(error.message || 'Request was cancelled.', {
      kind: 'cancelled',
      code: error.code,
      cause: error,
    });
  }

  if (error.response) {
    return new HttpClientError(error.message || 'HTTP request failed.', {
      kind: 'http',
      status: error.response.status,
      code: error.code,
      data: error.response.data,
      cause: error,
    });
  }

  return new HttpClientError(error.message || 'Network request failed.', {
    kind: 'network',
    code: error.code,
    cause: error,
  });
}
