import { isHttpClientError, type HttpClientError } from '@nevo/http-client';
import { ApiError, type ApiErrorKind, type MutationOutcome } from './ApiError';
import { commonErrorCodes, type ErrorCodeRule, type ErrorCodeTable } from './codes/common';

export interface ClassifyContext {
  readonly operation: string;
  /** HTTP method of the failed request; only reads are known to leave the server untouched. */
  readonly method: string;
  /** Codes of the calling context; they win over the common table and over the status default. */
  readonly codes?: ErrorCodeTable;
}

const readMethods = new Set(['GET', 'HEAD']);

/** A machine code (`CREATE_CONFLICT`, `forbidden`); HTTP titles such as `Bad Request` are not codes. */
const codePattern = /^(?:[a-z][a-z0-9_]*|[A-Z][A-Z0-9_]*)$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Reads the server's error code from the body shapes the Runtime produces. `code` wins; else `error`
 * only when it looks like a code (authorization and read features answer `{ error: 'forbidden' }`,
 * Fastify answers `{ error: 'Bad Request' }`). The server's message text is never read.
 */
export function readServerCode(data: unknown): string | undefined {
  if (!isRecord(data)) {
    return undefined;
  }

  if (typeof data.code === 'string' && data.code.length > 0) {
    return data.code;
  }

  if (typeof data.error === 'string' && codePattern.test(data.error)) {
    return data.error;
  }

  return undefined;
}

function lookup(table: ErrorCodeTable | undefined, code: string): ErrorCodeRule | undefined {
  return table && Object.hasOwn(table, code) ? table[code] : undefined;
}

function kindOfStatus(status: number, hasCode: boolean): ApiErrorKind {
  switch (status) {
    case 400:
      return 'validation';
    case 401:
      return 'unauthenticated';
    case 403:
      return 'forbidden';
    // "Route not found" (no code) means the URL is wrong, not that a resource is missing.
    case 404:
      return hasCode ? 'not-found' : 'protocol';
    case 409:
      return 'conflict';
    case 422:
      return 'precondition';
    case 429:
      return 'rate-limited';
    case 502:
    case 503:
    case 504:
      return 'unavailable';
    default:
      return status >= 500 ? 'server' : 'protocol';
  }
}

function retryAfterMs(headers: HttpClientError['headers']): number | undefined {
  const raw = headers?.['retry-after'];
  if (raw === undefined) {
    return undefined;
  }

  const seconds = Number(raw);

  return Number.isFinite(seconds) && seconds >= 0 ? Math.round(seconds * 1000) : undefined;
}

/**
 * The single place that turns a transport failure into an {@link ApiError}. Cancellation is not a
 * failure: the original error is returned so callers rethrow it unchanged.
 */
export function classifyHttpError(
  error: HttpClientError,
  context: ClassifyContext,
): ApiError | HttpClientError {
  if (error.kind === 'cancelled') {
    return error;
  }

  const { operation } = context;
  const isRead = readMethods.has(context.method.toUpperCase());
  const unknownForMutation: MutationOutcome = isRead ? 'not-applied' : 'unknown';

  if (error.kind === 'timeout') {
    return new ApiError({
      kind: 'timeout',
      operation,
      outcome: unknownForMutation,
      retryable: true,
      cause: error,
    });
  }

  if (error.kind === 'network') {
    return new ApiError({
      kind: 'network',
      operation,
      outcome: unknownForMutation,
      retryable: true,
      cause: error,
    });
  }

  if (error.kind !== 'http' || error.status === undefined) {
    return new ApiError({
      kind: 'protocol',
      operation,
      outcome: unknownForMutation,
      retryable: false,
      cause: error,
    });
  }

  const status = error.status;
  const requestId = error.headers?.['x-request-id'];
  // A non-JSON answer (HTML from a proxy or the SPA fallback) proves nothing about the commit.
  if (
    typeof error.data === 'string' &&
    error.data.length > 0 &&
    ![401, 403, 429].includes(status)
  ) {
    return new ApiError({
      kind: 'protocol',
      operation,
      outcome: unknownForMutation,
      retryable: false,
      status,
      requestId,
      cause: error,
    });
  }

  const code = readServerCode(error.data);
  const rule = code ? (lookup(context.codes, code) ?? lookup(commonErrorCodes, code)) : undefined;
  const kind = rule?.kind ?? kindOfStatus(status, code !== undefined);
  const outcome: MutationOutcome = isRead
    ? 'not-applied'
    : (rule?.outcome ?? (status >= 500 ? 'unknown' : 'not-applied'));
  const retryable =
    rule?.retryable ??
    (kind === 'rate-limited' || (kind === 'unavailable' && [502, 503, 504].includes(status)));

  return new ApiError({
    kind,
    operation,
    outcome,
    retryable,
    status,
    code,
    reason: rule?.reason,
    retryAfterMs: retryAfterMs(error.headers),
    requestId,
    cause: error,
  });
}

/**
 * Classifies a failure that came through a client not wrapped by the API transport. Errors that
 * are not HTTP failures (and cancellations) yield `undefined`.
 */
export function asApiError(error: unknown, context: ClassifyContext): ApiError | undefined {
  if (error instanceof ApiError) {
    return error;
  }

  if (!isHttpClientError(error)) {
    return undefined;
  }

  const classified = classifyHttpError(error, context);

  return classified instanceof ApiError ? classified : undefined;
}
