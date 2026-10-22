import { isHttpClientError } from '@nevo/http-client';

/** The machine-readable `error` code of a failed API response body, when the server sent one. */
export function apiErrorCode(error: unknown): string | undefined {
  if (
    !isHttpClientError(error) ||
    typeof error.data !== 'object' ||
    !error.data ||
    !('error' in error.data)
  )
    return undefined;
  return typeof error.data.error === 'string' ? error.data.error : undefined;
}
