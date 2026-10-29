import { isHttpClientError } from '@nevo/http-client';
import { isApiError } from '../../api';

/**
 * The machine-readable code of a failed API response, when the server (or a classified client
 * error, `ApiError.code`) gave one.
 */
export function apiErrorCode(error: unknown): string | undefined {
  if (isApiError(error)) return error.code;
  if (
    !isHttpClientError(error) ||
    typeof error.data !== 'object' ||
    !error.data ||
    !('error' in error.data)
  )
    return undefined;
  return typeof error.data.error === 'string' ? error.data.error : undefined;
}

/**
 * Whether a failed write may have been applied. A classified `ApiError` says so itself (a refusal
 * before anything was sent is `not-applied`); an HTTP failure without a status proves nothing.
 */
export function writeOutcomeUnknown(error: unknown): boolean {
  if (isApiError(error)) return error.outcome !== 'not-applied';
  return !isHttpClientError(error) || error.status === undefined;
}
