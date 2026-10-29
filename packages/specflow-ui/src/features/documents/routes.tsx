import { createRoute } from '@tanstack/react-router';
import { parseSpecificationCollection } from '../../app/router/search';
import { specificationRoute } from '../specs/routes';
import { DocumentsLayout } from './workspace/DocumentsLayout';

/**
 * Pathless layout of the two Documents routes: the URLs stay `documents` and
 * `documents/$documentId`, but one layout instance spans them and renders the Documents workspace
 * in every Runtime mode (see `DocumentsLayout`). The two routes only carry the URL and its search.
 */
export const documentsLayoutRoute = createRoute({
  getParentRoute: () => specificationRoute,
  id: 'documents-layout',
  component: DocumentsLayout,
});
export const documentsRoute = createRoute({
  getParentRoute: () => documentsLayoutRoute,
  path: 'documents',
  validateSearch: (search: Record<string, unknown>) => ({
    collection: parseSpecificationCollection(search),
  }),
});
export const documentDetailRoute = createRoute({
  getParentRoute: () => documentsLayoutRoute,
  path: 'documents/$documentId',
  validateSearch: (search: Record<string, unknown>) => ({
    collection: parseSpecificationCollection(search),
  }),
});
export const documentsAppRoutes = [
  documentsLayoutRoute.addChildren([documentsRoute, documentDetailRoute]),
] as const;
