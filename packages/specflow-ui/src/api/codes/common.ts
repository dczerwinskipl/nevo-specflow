import type { ApiErrorKind, ApiErrorReason, MutationOutcome } from '../ApiError';

/** What a server error code means to the product; anything not listed is classified by status. */
export interface ErrorCodeRule {
  readonly kind: ApiErrorKind;
  readonly outcome?: MutationOutcome;
  readonly retryable?: boolean;
  readonly reason?: ApiErrorReason;
}

export type ErrorCodeTable = Readonly<Record<string, ErrorCodeRule>>;

/**
 * Codes every Runtime route can answer. Lower-case snake codes are the `{ error }` bodies of
 * authorization, read features and login; the `FST_*` codes are Fastify's own.
 */
export const commonErrorCodes: ErrorCodeTable = {
  authentication_required: { kind: 'unauthenticated', outcome: 'not-applied' },
  invalid_credentials: { kind: 'unauthenticated', outcome: 'not-applied' },
  forbidden: { kind: 'forbidden', outcome: 'not-applied' },
  rate_limited: { kind: 'rate-limited', outcome: 'not-applied', retryable: true },
  service_unavailable: { kind: 'unavailable', retryable: true },
  // No adapter in this Runtime serves the read: permanent, not an incident.
  specification_source_unavailable: {
    kind: 'unavailable',
    retryable: false,
    reason: 'not-in-runtime',
  },
  specification_not_found: { kind: 'not-found', outcome: 'not-applied' },
  specification_document_not_found: { kind: 'not-found', outcome: 'not-applied' },
  specification_task_not_found: { kind: 'not-found', outcome: 'not-applied' },
  task_snapshot_expired: { kind: 'conflict', outcome: 'not-applied' },
  document_revision_unavailable: { kind: 'conflict', outcome: 'not-applied' },
  FST_ERR_VALIDATION: { kind: 'validation', outcome: 'not-applied' },
  FST_ERR_CTP_INVALID_JSON_BODY: { kind: 'protocol' },
  FST_ERR_CTP_EMPTY_JSON_BODY: { kind: 'protocol' },
  FST_ERR_CTP_BODY_TOO_LARGE: { kind: 'protocol', outcome: 'not-applied' },
  FST_ERR_CTP_INVALID_MEDIA_TYPE: { kind: 'protocol', outcome: 'not-applied' },
  FST_ERR_BAD_URL: { kind: 'protocol', outcome: 'not-applied' },
};
