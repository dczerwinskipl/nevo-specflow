import { docsSearchLimit, type DocsSearchQuery } from './api';

/**
 * Query keys of the documentation reader, all under `['docs', workspaceId]` so one workspace's
 * reads are invalidated, cancelled or dropped together. They never start with `['workspaces']`,
 * the key of the shared workspace list, which a prefix invalidation of the list would otherwise
 * also hit.
 */
export const docsKeys = {
  workspace: (workspaceId: string) => ['docs', workspaceId] as const,
  tree: (workspaceId: string) => ['docs', workspaceId, 'tree'] as const,
  document: (workspaceId: string, documentId: string) =>
    ['docs', workspaceId, 'document', documentId] as const,
  /** Every option as sent is part of the key, the Runtime defaults spelled out (`null` = default). */
  search: (workspaceId: string, query: DocsSearchQuery) =>
    [
      'docs',
      workspaceId,
      'search',
      {
        q: query.q,
        limit: docsSearchLimit(query) ?? null,
        includeProposals: query.includeProposals ?? false,
        snippets: query.snippets ?? true,
      },
    ] as const,
};
