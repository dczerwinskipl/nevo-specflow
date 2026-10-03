import axios, { AxiosError } from 'axios';

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

  if (
    error.request ||
    error.code === AxiosError.ERR_NETWORK ||
    error.code === AxiosError.ECONNABORTED ||
    error.code === AxiosError.ECONNREFUSED ||
    error.code === AxiosError.ETIMEDOUT
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
