import { createContext, useContext, type ReactNode } from 'react';

/** A Full Task section an action lands on (its heading takes focus). */
export type TaskSection = 'context' | 'dependencies';

/**
 * Where the Tasks page opens: only the Tasks blocking the Specification (`?blocking=specification`,
 * resolved by the Runtime when read), or at one group, expanded.
 */
export interface TasksPageTarget {
  readonly blocking?: 'specification';
  readonly group?: string;
}

/** Semantic operations provided by the specification workspace host. */
export interface WorkspaceRuntime {
  readonly previewTask: (taskId: string) => void;
  readonly openTask: (taskId: string, section?: TaskSection) => void;
  /** Opens the Tasks page (`/specs/:specId/tasks`); a history entry is pushed. */
  readonly openTasks: (target?: TasksPageTarget) => void;
  readonly openSession: (sessionId: string) => void;
  readonly openSessionsView: () => void;
  readonly openDoc: (docId: string, origin?: 'work' | 'documents') => void;
  readonly openDocumentsView: () => void;
  readonly openRepository: () => void;
  readonly openChanges: (source?: 'base' | 'uncommitted' | 'mr') => void;
  readonly openHistory: () => void;
  /** Opens the Specification's New Session; its entry points are gated by `startSession`. */
  readonly openNewSession: () => void;
  readonly refresh: () => void | Promise<void>;
  readonly fullTaskHref: (taskId: string) => string;
  /** The Tasks page address of a target (a real link; activation goes through `openTasks`). */
  readonly tasksHref: (target?: TasksPageTarget) => string;
  readonly canOpenSession?: boolean;
}

const WorkspaceRuntimeContext = createContext<WorkspaceRuntime | null>(null);

export interface WorkspaceProviderProps {
  readonly runtime: WorkspaceRuntime;
  readonly children: ReactNode;
}

/** Provides the WorkspaceRuntime to the workspace component tree. */
export function WorkspaceProvider({ runtime, children }: WorkspaceProviderProps) {
  return (
    <WorkspaceRuntimeContext.Provider value={runtime}>{children}</WorkspaceRuntimeContext.Provider>
  );
}

/** Hook to consume the semantic WorkspaceRuntime from any workspace section or control. */
export function useWorkspaceRuntime(): WorkspaceRuntime {
  const context = useContext(WorkspaceRuntimeContext);
  if (!context) {
    throw new Error('useWorkspaceRuntime must be used within a WorkspaceProvider');
  }

  return context;
}

const noop = () => undefined;

/** Creates a fake WorkspaceRuntime for testing and Storybook fixtures. */
export function createFakeWorkspaceRuntime(
  overrides: Partial<WorkspaceRuntime> = {},
): WorkspaceRuntime {
  return {
    previewTask: noop,
    openTask: noop,
    openTasks: noop,
    openSession: noop,
    openSessionsView: noop,
    openDoc: noop,
    openDocumentsView: noop,
    openRepository: noop,
    openChanges: noop,
    openHistory: noop,
    openNewSession: noop,
    refresh: noop,
    fullTaskHref: (taskId) => `/specs/fake/tasks/${encodeURIComponent(taskId)}`,
    tasksHref: () => '/specs/fake/tasks',
    canOpenSession: true,
    ...overrides,
  };
}
