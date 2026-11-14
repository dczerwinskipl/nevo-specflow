import { createRoute } from '@tanstack/react-router';
import { appRoute } from '../../app/router/root';
import { DocsReaderLayout } from './reader/DocsReaderLayout';

/**
 * Pathless layout of the documentation reader: `/docs` (the tab's current workspace, replaced by
 * its address), `/workspaces/$workspaceId/docs` and `/workspaces/$workspaceId/docs/$documentId`
 * (`#sectionId`). One layout instance spans them, so opening a document or picking a workspace only
 * changes the parameters: the tree, the search and the workspace stay mounted.
 */
export const docsLayoutRoute = createRoute({
  getParentRoute: () => appRoute,
  id: 'docs-reader',
  component: DocsReaderLayout,
});
export const docsRoute = createRoute({
  getParentRoute: () => docsLayoutRoute,
  path: '/docs',
});
export const docsWorkspaceRoute = createRoute({
  getParentRoute: () => docsLayoutRoute,
  path: '/workspaces/$workspaceId/docs',
});
export const docsDocumentRoute = createRoute({
  getParentRoute: () => docsLayoutRoute,
  path: '/workspaces/$workspaceId/docs/$documentId',
});
export const docsAppRoutes = [
  docsLayoutRoute.addChildren([docsRoute, docsWorkspaceRoute, docsDocumentRoute]),
] as const;
