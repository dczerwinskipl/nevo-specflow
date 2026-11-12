/**
 * Read model of the documentation reader: the port of the workspace documentation routes, its
 * query keys (`['docs', workspaceId, …]`), the read hooks with their corpus revision coherence, and
 * the failure classification. A leaf entry: it imports no feature's screens.
 */
export {
  createRuntimeDocsApi,
  docsErrorCodes,
  docsReadOperation,
  docsSearchLimit,
  docsSearchParams,
  type DocsApi,
  type DocsArticleResult,
  type DocsSearchQuery,
} from './api';
export { docsFailure, type DocsFailure } from './failure';
export { docsKeys } from './queries';
export { leaveDocsWorkspace, reconcileDocsRevision, revisionOf } from './revision';
export { docsQueries, useDocsArticle, useDocsSearch, useDocsTree } from './useDocsReads';
