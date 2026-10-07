export const specificationKeys = {
  all: ['specifications'] as const,
  detail: (specId: string) => [...specificationKeys.all, 'detail', specId] as const,
  document: (specId: string, docId: string) =>
    [...specificationKeys.all, 'document', specId, docId] as const,
  changes: (specId: string, source: string) =>
    [...specificationKeys.all, 'changes', specId, source] as const,
  task: (specId: string, taskId: string) =>
    [...specificationKeys.all, 'task', specId, taskId] as const,
};
