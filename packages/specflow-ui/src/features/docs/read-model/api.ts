import type {
  DocsDocumentInactiveError,
  DocsDocumentNotFoundError,
  DocsDocumentSkippedError,
  WorkspaceDocsArticle,
  WorkspaceDocsSearch,
  WorkspaceDocsTree,
} from '@nevo/specflow-contracts/docs';
import { isHttpClientError } from '@nevo/http-client';
import { ApiError, isApiError, type ApiTransport, type ErrorCodeTable } from '../../../api';

/** Operation name of the documentation reads (error classification, diagnostics). */
export const docsReadOperation = 'docs.read';

/**
 * The documentation codes (`WorkspaceDocsError` and the document refusals). A `409` workspace that
 * cannot be read now is unavailable, not a conflict; a `410` inactive document is a known refusal,
 * not a protocol failure.
 */
export const docsErrorCodes: ErrorCodeTable = {
  DOCS_WORKSPACE_NOT_FOUND: { kind: 'not-found', outcome: 'not-applied' },
  DOCS_WORKSPACE_UNAVAILABLE: { kind: 'unavailable', outcome: 'not-applied', retryable: true },
  DOCS_NOT_CONFIGURED: { kind: 'unavailable', outcome: 'not-applied', retryable: false },
  DOCS_UNAVAILABLE: { kind: 'unavailable', outcome: 'not-applied', retryable: true },
  DOCS_DOCUMENT_INACTIVE: { kind: 'not-found', outcome: 'not-applied' },
  DOCS_DOCUMENT_SKIPPED: { kind: 'not-found', outcome: 'not-applied' },
  DOCS_DOCUMENT_NOT_FOUND: { kind: 'not-found', outcome: 'not-applied' },
};

/**
 * One article read. A document refusal is an answer, not a failure: it carries the corpus it was
 * decided in, so the reader compares its revision with the tree's like an article's.
 */
export type DocsArticleResult =
  | { readonly kind: 'article'; readonly article: WorkspaceDocsArticle }
  | { readonly kind: 'inactive'; readonly refusal: DocsDocumentInactiveError }
  | { readonly kind: 'skipped'; readonly refusal: DocsDocumentSkippedError }
  | { readonly kind: 'not-found'; readonly refusal: DocsDocumentNotFoundError };

/** What the reader searches for; the port turns it into the route's string query values. */
export interface DocsSearchQuery {
  readonly q: string;
  /** Maximum documents; clamped to the route's `1..50`. The Runtime's default is 10. */
  readonly limit?: number;
  readonly includeNonAuthoritative?: boolean;
  /** `false` leaves out each section's excerpt. */
  readonly snippets?: boolean;
}

/** Port of the workspace documentation routes (`/api/workspaces/:workspaceId/docs…`). */
export interface DocsApi {
  tree(workspaceId: string, signal?: AbortSignal): Promise<WorkspaceDocsTree>;
  article(
    workspaceId: string,
    documentId: string,
    signal?: AbortSignal,
  ): Promise<DocsArticleResult>;
  search(
    workspaceId: string,
    query: DocsSearchQuery,
    signal?: AbortSignal,
  ): Promise<WorkspaceDocsSearch>;
}

const isObject = (data: unknown): data is Record<string, unknown> =>
  typeof data === 'object' && data !== null;

/**
 * An answer belongs to the workspace it was requested for: one naming another workspace is a
 * protocol failure, never shown under the requested one.
 */
const isEnvelopeOf = (workspaceId: string, data: unknown): data is Record<string, unknown> =>
  isObject(data) &&
  data.workspaceId === workspaceId &&
  typeof data.corpusRevision === 'string' &&
  Array.isArray(data.skipped);

const workspacePath = (workspaceId: string) =>
  `/api/workspaces/${encodeURIComponent(workspaceId)}/docs`;

/** The `limit` the route is sent: an integer in `1..50`, or absent for the Runtime's default. */
export function docsSearchLimit(query: DocsSearchQuery): number | undefined {
  return query.limit === undefined || !Number.isFinite(query.limit)
    ? undefined
    : Math.min(50, Math.max(1, Math.trunc(query.limit)));
}

/** The route accepts only these parameters, all as strings: `limit` `1..50`, switches `true`/`false`. */
export function docsSearchParams(query: DocsSearchQuery): Record<string, string> {
  const limit = docsSearchLimit(query);

  return {
    q: query.q,
    ...(limit === undefined ? {} : { limit: String(limit) }),
    ...(query.includeNonAuthoritative === undefined
      ? {}
      : { includeNonAuthoritative: String(query.includeNonAuthoritative) }),
    ...(query.snippets === undefined ? {} : { snippets: String(query.snippets) }),
  };
}

const refusalKinds = {
  DOCS_DOCUMENT_INACTIVE: 'inactive',
  DOCS_DOCUMENT_SKIPPED: 'skipped',
  DOCS_DOCUMENT_NOT_FOUND: 'not-found',
} as const;

/**
 * The document refusal a failed article read carries, decided by its `code`, never its text;
 * `undefined` for any other failure. A refusal of another workspace, or without its corpus, is a
 * protocol failure: it is never shown under the requested workspace.
 */
function articleRefusal(workspaceId: string, error: unknown): DocsArticleResult | undefined {
  if (!isApiError(error) || !error.code || !Object.hasOwn(refusalKinds, error.code)) {
    return undefined;
  }

  const kind = refusalKinds[error.code as keyof typeof refusalKinds];
  const body = isHttpClientError(error.cause) ? error.cause.data : undefined;
  if (
    !isObject(body) ||
    body.workspaceId !== workspaceId ||
    typeof body.corpusRevision !== 'string' ||
    (kind === 'skipped' && !Array.isArray(body.skipped))
  ) {
    throw new ApiError({
      kind: 'protocol',
      operation: error.operation,
      outcome: 'not-applied',
      retryable: false,
      status: error.status,
      code: error.code,
      requestId: error.requestId,
      cause: error,
    });
  }

  return { kind, refusal: body } as DocsArticleResult;
}

export function createRuntimeDocsApi(api: ApiTransport): DocsApi {
  return {
    tree: (workspaceId, signal) =>
      api.get<WorkspaceDocsTree>(workspacePath(workspaceId), {
        operation: 'docs.tree',
        signal,
        isValid: (data) =>
          isEnvelopeOf(workspaceId, data) &&
          Array.isArray(data.documents) &&
          Array.isArray(data.inactive) &&
          typeof data.docsRoot === 'string',
      }),
    article: async (workspaceId, documentId, signal) => {
      try {
        const article = await api.get<WorkspaceDocsArticle>(
          `${workspacePath(workspaceId)}/documents/${encodeURIComponent(documentId)}`,
          {
            operation: 'docs.article',
            signal,
            isValid: (data) =>
              isEnvelopeOf(workspaceId, data) &&
              isObject(data.document) &&
              typeof data.body === 'string' &&
              Array.isArray(data.sections),
          },
        );

        return { kind: 'article', article };
      } catch (error) {
        const refusal = articleRefusal(workspaceId, error);
        if (refusal) {
          return refusal;
        }

        throw error;
      }
    },
    search: (workspaceId, query, signal) =>
      api.get<WorkspaceDocsSearch>(`${workspacePath(workspaceId)}/search`, {
        operation: 'docs.search',
        signal,
        params: docsSearchParams(query),
        isValid: (data) =>
          isEnvelopeOf(workspaceId, data) &&
          Array.isArray(data.results) &&
          typeof data.nonAuthoritativeLeftOut === 'number',
      }),
  };
}
