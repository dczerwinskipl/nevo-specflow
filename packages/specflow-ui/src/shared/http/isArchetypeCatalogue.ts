/**
 * Shape check of `GET /api/specs/archetypes` (`ArchetypeCatalogue`). Create and the documents
 * feature read it into one cache entry, so both fetchers validate the answer with this one check.
 */
export function isArchetypeCatalogue(data: unknown): boolean {
  if (typeof data !== 'object' || data === null) return false;
  const catalogue = data as Record<string, unknown>;
  return (
    typeof catalogue.revision === 'string' &&
    Array.isArray(catalogue.archetypes) &&
    Array.isArray(catalogue.documentTypes)
  );
}
