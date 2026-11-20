import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

/** What the Task history keeps across nested inspection and Back: scroll and disclosures. */
interface TaskViewState {
  historyScroll?: number;
  historyExpanded?: Record<string, string>;
  inspectionDisclosures?: Record<string, boolean>;
  inspectionCopyStatus?: Record<string, 'copied' | 'failed'>;
}
const Context = createContext<Map<string, TaskViewState> | null>(null);
export function TaskViewStateProvider({ children }: { readonly children: ReactNode }) {
  const store = useRef(new Map<string, TaskViewState>());

  return <Context.Provider value={store.current}>{children}</Context.Provider>;
}

export function useTaskViewState(taskId: string) {
  const store = useContext(Context);
  const [state, setState] = useState<TaskViewState>(() => store?.get(taskId) ?? {});
  const update = useCallback(
    (patch: TaskViewState | ((previous: TaskViewState) => TaskViewState)) => {
      setState((previous) => {
        const current = store?.get(taskId) ?? previous;
        const next = { ...current, ...(typeof patch === 'function' ? patch(current) : patch) };
        store?.set(taskId, next);

        return next;
      });
    },
    [store, taskId],
  );
  const saveHistoryScroll = useCallback(
    (top: number) => {
      store?.set(taskId, { ...store.get(taskId), historyScroll: top });
    },
    [store, taskId],
  );

  return { state, update, saveHistoryScroll };
}
