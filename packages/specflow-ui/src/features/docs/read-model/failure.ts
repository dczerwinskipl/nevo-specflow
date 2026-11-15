import { isHttpClientError } from '@nevo/http-client';
import { isApiError } from '../../../api';

/**
 * Why the documentation of a workspace cannot be shown, decided by the Runtime's `code` (and the
 * classified kind for the shared answers), never by its text:
 * - `workspace-not-found`: not registered (any more);
 * - `workspace-unavailable`: registered, but its checkout cannot be read now;
 * - `not-configured`: its `docs.root` is not a directory; `docsRoot` is the configured value;
 * - `docs-unavailable`: its documentation settings are invalid or reading failed;
 * - `forbidden`: the caller lacks `docs.view`;
 * - `other`: anything else (network, timeout, protocol): the generic API error copy applies.
 */
export type DocsFailure =
  | { readonly kind: 'workspace-not-found' }
  | { readonly kind: 'workspace-unavailable' }
  | { readonly kind: 'not-configured'; readonly docsRoot?: string }
  | { readonly kind: 'docs-unavailable' }
  | { readonly kind: 'forbidden' }
  | { readonly kind: 'other' };

function docsRootOf(error: { readonly cause?: unknown }): string | undefined {
  const data = isHttpClientError(error.cause) ? error.cause.data : undefined;
  const docsRoot =
    typeof data === 'object' && data !== null && 'docsRoot' in data ? data.docsRoot : undefined;

  return typeof docsRoot === 'string' && docsRoot.length > 0 ? docsRoot : undefined;
}

export function docsFailure(error: unknown): DocsFailure {
  if (!isApiError(error)) {
    return { kind: 'other' };
  }

  switch (error.code) {
    case 'DOCS_WORKSPACE_NOT_FOUND':
      return { kind: 'workspace-not-found' };
    case 'DOCS_WORKSPACE_UNAVAILABLE':
      return { kind: 'workspace-unavailable' };
    case 'DOCS_NOT_CONFIGURED': {
      const docsRoot = docsRootOf(error);

      return docsRoot ? { kind: 'not-configured', docsRoot } : { kind: 'not-configured' };
    }

    case 'DOCS_UNAVAILABLE':
      return { kind: 'docs-unavailable' };
    default:
      return error.kind === 'forbidden' ? { kind: 'forbidden' } : { kind: 'other' };
  }
}
