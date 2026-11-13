import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateTaskInput,
  EditTaskInput,
  SetTaskStatusInput,
} from '@nevo/specflow-contracts/tasks';
import { useAppServices } from '../../../app/useAppServices';
import { taskKeys } from '../queries';
import { invalidateAfterTaskChange, taskAuthoringKeys } from './queries';

/** What the owner may do with the Specification now (`createTask`, the allowed task types). */
export function useSpecificationActions(specId: string, enabled = true) {
  const { taskAuthoringApi } = useAppServices();

  return useQuery({
    queryKey: taskAuthoringKeys.specificationActions(specId),
    queryFn: ({ signal }) => taskAuthoringApi.specificationActions(specId, signal),
    enabled,
  });
}

/** What the owner may do with one Task now (lifecycle actions and the start blockers). */
export function useTaskActions(specId: string, taskId: string) {
  const { taskAuthoringApi } = useAppServices();

  return useQuery({
    queryKey: taskAuthoringKeys.taskActions(specId, taskId),
    queryFn: ({ signal }) => taskAuthoringApi.taskActions(specId, taskId, signal),
  });
}

export function useTaskDocumentTree(specId: string, taskId: string) {
  const { taskAuthoringApi } = useAppServices();

  return useQuery({
    queryKey: taskAuthoringKeys.documents(specId, taskId),
    queryFn: ({ signal }) => taskAuthoringApi.documentTree(specId, taskId, signal),
  });
}

export function useCreateTask(specId: string) {
  const { taskAuthoringApi } = useAppServices();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateTaskInput) => taskAuthoringApi.createTask(specId, input),
    onSuccess: () => invalidateAfterTaskChange(queryClient, specId),
  });
}

/**
 * The Task commands of one Task. Each carries the identity it was started for (`specId`, `taskId`
 * captured here, the revision in the variables), so a late answer refreshes that Task only.
 */
export function useTaskCommands(
  specId: string,
  taskId: string,
  options: {
    /** After a removal: leave the Task's page before its caches go (no refetch of a gone Task). */
    readonly onRemoved?: () => void;
  } = {},
) {
  const { taskAuthoringApi } = useAppServices();
  const queryClient = useQueryClient();
  const refresh = () => invalidateAfterTaskChange(queryClient, specId);
  const removed = async () => {
    options.onRemoved?.();
    queryClient.removeQueries({ queryKey: taskKeys.detail(specId, taskId), exact: true });
    queryClient.removeQueries({ queryKey: taskAuthoringKeys.taskActions(specId, taskId) });
    queryClient.removeQueries({ queryKey: taskAuthoringKeys.documents(specId, taskId) });
    await refresh();
  };

  const edit = useMutation({
    mutationFn: (input: EditTaskInput) => taskAuthoringApi.editTask(specId, taskId, input),
    onSuccess: refresh,
  });
  const setStatus = useMutation({
    mutationFn: (input: SetTaskStatusInput) => taskAuthoringApi.setStatus(specId, taskId, input),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (expectedRevision: string) =>
      taskAuthoringApi.removeTask(specId, taskId, expectedRevision),
    onSuccess: removed,
  });

  return { edit, setStatus, remove, refresh };
}
