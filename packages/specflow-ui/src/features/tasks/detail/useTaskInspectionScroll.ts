import { useLayoutEffect, useRef } from 'react';
import { descriptionScrollOwner, restoreScrollPosition } from '../../documents';

import { useTaskViewState } from './TaskViewState';

/** Remember a keyed inspection across a nested evidence push, after workspace focus restores. */
export function useTaskInspectionScroll(taskId: string, key: string) {
  const root = useRef<HTMLDivElement>(null);
  const { state, saveInspectionScroll } = useTaskViewState(taskId);
  const initial = useRef(state.inspectionScroll?.[key] ?? 0);
  const prepared = useRef(false);
  useLayoutEffect(() => {
    const node = root.current;
    if (!node) return;
    const stopRestoring = restoreScrollPosition(node, () => initial.current);
    return () => {
      stopRestoring();
      if (!prepared.current) saveInspectionScroll(key, descriptionScrollOwner(node).scrollTop);
    };
  }, [key, saveInspectionScroll]);
  return {
    root,
    remember: () => {
      if (root.current) {
        prepared.current = true;
        saveInspectionScroll(key, descriptionScrollOwner(root.current).scrollTop);
      }
    },
  };
}
