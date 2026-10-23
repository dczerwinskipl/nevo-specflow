import { describe, expect, it } from 'vitest';
import { createMemoryHistory } from '@tanstack/react-router';
import { createSpecFlowRouter } from '../router';
import { createSpecFlowAppServices } from '../../services';
import { isDocumentsLocation, isWithinSpecDocuments } from './routeScope';

// The full paths the router hands to blockers, read from the application's real route tree.
const router = createSpecFlowRouter(
  createMemoryHistory({ initialEntries: ['/'] }),
  createSpecFlowAppServices(),
);
const fullPathOf = (id: string) =>
  (router.routesById as Record<string, { fullPath: string }>)[id]!.fullPath;
const documentsRoute = { fullPath: fullPathOf('/_app/specs/$specId/documents-layout/documents') };
const documentDetailRoute = {
  fullPath: fullPathOf('/_app/specs/$specId/documents-layout/documents/$documentId'),
};

const at = (fullPath: string, params: Record<string, unknown>) => ({ fullPath, params });

describe('documents locations', () => {
  it('recognises the real Documents routes by their full path', () => {
    expect(isDocumentsLocation(at(documentsRoute.fullPath, {}))).toBe(true);
    expect(isDocumentsLocation(at(documentDetailRoute.fullPath, {}))).toBe(true);
    expect(isDocumentsLocation(at('/specs/$specId/sessions', {}))).toBe(false);
    expect(isDocumentsLocation(at('/specs/$specId/documents-archive', {}))).toBe(false);
  });

  it('treats list <-> document and document <-> document of one specification as inside', () => {
    const list = at(documentsRoute.fullPath, { specId: 's' });
    const a = at(documentDetailRoute.fullPath, { specId: 's', documentId: 'a' });
    const b = at(documentDetailRoute.fullPath, { specId: 's', documentId: 'b' });
    expect(isWithinSpecDocuments(a, b)).toBe(true);
    expect(isWithinSpecDocuments(list, a)).toBe(true);
    expect(isWithinSpecDocuments(a, list, 's')).toBe(true);
  });

  it('is not inside when the specification differs or the screen is left', () => {
    const a = at(documentDetailRoute.fullPath, { specId: 's', documentId: 'a' });
    const other = at(documentDetailRoute.fullPath, { specId: 'x', documentId: 'a' });
    expect(isWithinSpecDocuments(a, other)).toBe(false);
    expect(isWithinSpecDocuments(a, other, 's')).toBe(false);
    expect(isWithinSpecDocuments(a, at('/specs/$specId', { specId: 's' }))).toBe(false);
    expect(isWithinSpecDocuments(a, a, 'x')).toBe(false);
  });
});
