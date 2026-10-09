export const specificationKeys = {
  all: ['specifications'] as const,
  spec: (specId: string) => [...specificationKeys.all, specId] as const,
  detail: (specId: string) => [...specificationKeys.spec(specId), 'workspace'] as const,
  document: (specId: string, docId: string) =>
    [...specificationKeys.spec(specId), 'document', docId] as const,
  changes: (specId: string, source: string) =>
    [...specificationKeys.spec(specId), 'changes', source] as const,
};
