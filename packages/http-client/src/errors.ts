import axios, { AxiosError } from 'axios';

export type HttpErrorKind = 'cancelled' | 'http' | 'network' | 'timeout' | 'unexpected';

export class HttpClientError extends Error {
  readonly kind: HttpErrorKind;
  readonly status?: number;
  readonly code?: string;
  readonly data?: unknown;
  /** Response headers (lower-case names) when the server answered. */
  readonly headers?: Readonly<Record<string, string>>;

  constructor(
    message: string,
    options: {
      readonly kind: HttpErrorKind;
      readonly status?: number;
      readonly code?: string;
      readonly data?: unknown;
      readonly headers?: Readonly<Record<string, string>>;
      readonly cause?: unknown;
    },
  ) {
    super(message, { cause: options.cause });
    this.name = 'HttpClientError';
    this.kind = options.kind;
    this.status = options.status;
    this.code = options.code;
    this.data = options.data;
    this.headers = options.headers;
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
      headers: toPlainHeaders(error.response.headers),
      cause: error,
    });
  }

  if (error.code === AxiosError.ECONNABORTED || error.code === AxiosError.ETIMEDOUT) {
    return new HttpClientError(error.message || 'Request timed out.', {
      kind: 'timeout',
      code: error.code,
      cause: error,
    });
  }

  if (
    error.request ||
    error.code === AxiosError.ERR_NETWORK ||
    error.code === AxiosError.ECONNREFUSED
  ) {
    return new HttpClientError(error.message || 'Network request failed.', {
      kind: 'network',
      code: error.code,
      cause: error,
    });
  }

  return new HttpClientError(error.message || 'Unexpected HTTP client error.', {
    kind: 'unexpected',
    code: error.code,
    cause: error,
  });
}

function toPlainHeaders(headers: unknown): Record<string, string> | undefined {
  if (!headers || typeof headers !== 'object') {
    return undefined;
  }
  const entries = Object.entries(headers as Record<string, unknown>).flatMap(([name, value]) =>
    typeof value === 'string' ? [[name.toLowerCase(), value] as const] : [],
  );
  return Object.fromEntries(entries);
}
