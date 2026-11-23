import { useQuery } from '@tanstack/react-query';
import { useAppServices } from '../../../../app/useAppServices';
import type { WorkflowSubjectRef } from '../api';
import { workflowHistoryKey } from './useAttemptCommit';

/**
 * The workflow history of one subject (every attempt with the agent's events and work). A history
 * that cannot be read leaves the entries as they are: the agent detail is additive, so a failed read
 * shows nothing and never blocks the page.
 */
export function useWorkflowHistory(subject: WorkflowSubjectRef) {
  const { workflowExecutionApi } = useAppServices();

  return useQuery({
    queryKey: workflowHistoryKey(subject.specId, subject.taskId),
    queryFn: ({ signal }) => workflowExecutionApi.history(subject, signal),
    retry: false,
  });
}
