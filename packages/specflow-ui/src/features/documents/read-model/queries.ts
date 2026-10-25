/** Document cache stays under the Specification identity for scoped invalidation. */
export const documentKeys = {
  detail: (specId: string, documentId: string, revision?: string) =>
    ['specifications', specId, 'document', documentId, { revision: revision ?? null }] as const,
};
export const documentTreeKeys = {
  tree: (specId: string) => ['specifications', specId, 'document-tree'] as const,
};
/** The archetype catalogue as the documents feature reads it (type titles and instructions). */
export const documentCatalogueKeys = {
  all: ['documents', 'archetype-catalogue'] as const,
  /** Per documents adapter: the demo catalogue and the project one never share an entry. */
  catalogue: (adapter: 'demo' | 'project') =>
    ['documents', 'archetype-catalogue', adapter] as const,
};
