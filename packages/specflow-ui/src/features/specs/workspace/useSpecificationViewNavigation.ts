import { useCallback, useState } from 'react';
import type { SpecificationWorkspaceView } from './model';

export interface UseSpecificationViewNavigationOptions {
  readonly initialView?: SpecificationWorkspaceView;
  readonly initialTask?: string;
  readonly onNavigateView?: (target: {
    view: SpecificationWorkspaceView;
    taskId?: string | null;
  }) => void;
  readonly onViewChange?: (view: SpecificationWorkspaceView) => void;
  readonly onTaskChange?: (taskId: string | null) => void;
}

export interface UseSpecificationViewNavigationResult {
  readonly currentView: SpecificationWorkspaceView;
  readonly fullTaskId: string | null;
  readonly navigateToView: (
    nextView: SpecificationWorkspaceView,
    nextTaskId?: string | null,
  ) => void;
  readonly handleViewChange: (view: SpecificationWorkspaceView) => void;
}

/**
 * Encapsulates Specification Workspace view navigation.
 * When onNavigateView is provided (TanStack Router integration),
 * the router search parameters are the single source of truth.
 * For standalone fixtures and tests, falls back to component-local uncontrolled state.
 */
export function useSpecificationViewNavigation({
  initialView = 'work',
  initialTask,
  onNavigateView,
  onViewChange,
  onTaskChange,
}: UseSpecificationViewNavigationOptions): UseSpecificationViewNavigationResult {
  const isControlled = Boolean(onNavigateView);

  const [uncontrolledView, setUncontrolledView] = useState<SpecificationWorkspaceView>(
    initialView === 'task' || initialTask ? 'task' : initialView,
  );
  const [uncontrolledTaskId, setUncontrolledTaskId] = useState<string | null>(
    initialView === 'task' || initialTask ? (initialTask ?? null) : null,
  );

  const currentView: SpecificationWorkspaceView = isControlled
    ? initialView === 'task' || initialTask
      ? 'task'
      : initialView
    : uncontrolledView;

  const fullTaskId: string | null = isControlled
    ? initialView === 'task' || initialTask
      ? (initialTask ?? null)
      : null
    : uncontrolledTaskId;

  const navigateToView = useCallback(
    (nextView: SpecificationWorkspaceView, nextTaskId: string | null = null) => {
      if (onNavigateView) {
        onNavigateView({ view: nextView, taskId: nextTaskId });
      } else {
        setUncontrolledView(nextView);
        setUncontrolledTaskId(nextTaskId);
        onViewChange?.(nextView);
        onTaskChange?.(nextTaskId);
      }
    },
    [onNavigateView, onViewChange, onTaskChange],
  );

  const handleViewChange = useCallback(
    (view: SpecificationWorkspaceView) => {
      navigateToView(view, null);
    },
    [navigateToView],
  );

  return {
    currentView,
    fullTaskId,
    navigateToView,
    handleViewChange,
  };
}
