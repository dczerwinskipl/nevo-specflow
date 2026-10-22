/**
 * How a failed Runtime call is classified for the product. Created only by the API transport so a
 * component never parses a response body or an HTTP status. There is deliberately no `cancelled`
 * kind (cancellation is an `AbortError`, not a user-facing failure) and no `unknown` kind
 * (programming errors are not `ApiError` and reach the error boundary).
 */
export type ApiErrorKind =
  /** No answer: offline, connection refused, Runtime not running. */
  | 'network'
  /** The time limit elapsed; the request MAY have reached the server and been committed. */
  | 'timeout'
  | 'unauthenticated'
  | 'forbidden'
  | 'not-found'
  | 'validation'
  | 'conflict'
  /** The environment does not satisfy a precondition (Git disabled, missing ref). */
  | 'precondition'
  /** The server journal needs recovery: outcome unknown, never repeat the request blindly. */
  | 'recovery-required'
  | 'rate-limited'
  /** The service is temporarily or permanently unavailable (see {@link ApiErrorReason}). */
  | 'unavailable'
  | 'server'
  /** An answer of an unexpected shape (HTML from a proxy, broken invariant). */
  | 'protocol';

export const apiErrorKinds: readonly ApiErrorKind[] = [
  'network',
  'timeout',
  'unauthenticated',
  'forbidden',
  'not-found',
  'validation',
  'conflict',
  'precondition',
  'recovery-required',
  'rate-limited',
  'unavailable',
  'server',
  'protocol',
];

/** Whether the server may have changed state. Reads are always `not-applied`. */
export type MutationOutcome = 'not-applied' | 'unknown';

/**
 * Why a service is unavailable, when the Runtime says so. `not-in-runtime` is permanent for this
 * Runtime (no adapter serves the feature): retrying cannot help and it is not an incident.
 */
export type ApiErrorReason = 'not-in-runtime';

export interface ApiErrorInit {
  readonly kind: ApiErrorKind;
  /** Operation name (`specs.create`): the i18n and diagnostics key. */
  readonly operation: string;
  readonly outcome: MutationOutcome;
  /** The same request may succeed later. It does not license repeating a mutation. */
  readonly retryable: boolean;
  readonly status?: number;
  /** Server error code (`CREATE_CONFLICT`, `authentication_required`); never a message. */
  readonly code?: string;
  readonly reason?: ApiErrorReason;
  readonly retryAfterMs?: number;
  readonly requestId?: string;
  readonly cause?: unknown;
}

export class ApiError extends Error implements ApiErrorInit {
  readonly kind: ApiErrorKind;
  readonly operation: string;
  readonly outcome: MutationOutcome;
  readonly retryable: boolean;
  readonly status?: number;
  readonly code?: string;
  readonly reason?: ApiErrorReason;
  readonly retryAfterMs?: number;
  readonly requestId?: string;

  constructor(init: ApiErrorInit) {
    // The message is technical (logs, diagnostics) and is never displayed to the user.
    super(`${init.operation}:${init.kind}${init.code ? `:${init.code}` : ''}`, {
      cause: init.cause,
    });
    this.name = 'ApiError';
    this.kind = init.kind;
    this.operation = init.operation;
    this.outcome = init.outcome;
    this.retryable = init.retryable;
    this.status = init.status;
    this.code = init.code;
    this.reason = init.reason;
    this.retryAfterMs = init.retryAfterMs;
    this.requestId = init.requestId;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}
