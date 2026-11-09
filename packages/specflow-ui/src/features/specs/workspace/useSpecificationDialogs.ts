import { useCallback, useState } from 'react';

export interface UseSpecificationDialogsOptions {
  readonly onExecute?: (agent: string, tasks: readonly string[]) => void | Promise<void>;
}

export interface UseSpecificationDialogsResult {
  readonly executeDialogOpen: boolean;
  readonly tasksToExecute: readonly string[];
  readonly openExecuteDialog: (tasks: readonly string[]) => void;
  readonly closeExecuteDialog: () => void;
  readonly handleConfirmExecute: (agent: string) => void;
}

/** Encapsulates the Task batch execution dialog state and dispatching of Specification Workspace. */
export function useSpecificationDialogs({
  onExecute,
}: UseSpecificationDialogsOptions): UseSpecificationDialogsResult {
  const [executeDialogOpen, setExecuteDialogOpen] = useState(false);
  const [tasksToExecute, setTasksToExecute] = useState<readonly string[]>([]);

  const openExecuteDialog = useCallback((tasks: readonly string[]) => {
    setTasksToExecute(tasks);
    setExecuteDialogOpen(true);
  }, []);

  const closeExecuteDialog = useCallback(() => {
    setExecuteDialogOpen(false);
  }, []);

  const handleConfirmExecute = useCallback(
    (agent: string) => {
      setExecuteDialogOpen(false);
      void onExecute?.(agent, Array.from(tasksToExecute));
    },
    [onExecute, tasksToExecute],
  );

  return {
    executeDialogOpen,
    tasksToExecute,
    openExecuteDialog,
    closeExecuteDialog,
    handleConfirmExecute,
  };
}
