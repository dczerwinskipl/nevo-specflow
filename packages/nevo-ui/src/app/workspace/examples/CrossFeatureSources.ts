/** Three independently refreshing domain sources used by cross-feature Secondary examples. */
export interface TaskRecord {
  id: string;
  title: string;
  changeId: string;
  updatedAt: string;
}
export interface ChangeRecord {
  id: string;
  title: string;
  fileId: string;
  updatedAt: string;
}
export interface FileRecord {
  id: string;
  path: string;
  content: string;
  updatedAt: string;
}
export interface ExampleSource<T extends { updatedAt: string }> {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => T;
  refresh: (revision: number) => void;
}
function createSource<T extends { updatedAt: string }>(initial: T): ExampleSource<T> {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => value,
    subscribe: listener => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    refresh: revision => {
      value = { ...value, updatedAt: `revision ${revision}` };
      for (const listener of listeners) listener();
    },
  };
}
export function createCrossFeatureSources() {
  const task = createSource<TaskRecord>({
    id: 'task-1', title: 'Implement navigation', changeId: 'change-1', updatedAt: 'revision 1',
  });
  const changes = createSource<ChangeRecord>({
    id: 'change-1', title: 'Changed files', fileId: 'file-1', updatedAt: 'revision 1',
  });
  const file = createSource<FileRecord>({
    id: 'file-1', path: 'src/components/App.tsx', content: 'Updated UI component', updatedAt: 'revision 1',
  });
  let revision = 1;
  return {
    task, changes, file,
    refresh: () => {
      revision += 1;
      task.refresh(revision);
      changes.refresh(revision);
      file.refresh(revision);
    },
  };
}
export type CrossFeatureSources = ReturnType<typeof createCrossFeatureSources>;
