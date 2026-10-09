import type { TFunction } from 'i18next';
import type { TaskItem, SessionSummary } from './model';

const TASK_STATUS_KEYS = {
  pending: 'specification.taskStatusPending',
  in_progress: 'specification.taskStatusInProgress',
  completed: 'specification.taskStatusCompleted',
  blocked: 'specification.taskStatusBlocked',
} as const;

const SESSION_STATUS_KEYS = {
  active: 'specification.sessionStatusActive',
  attention: 'specification.sessionStatusAttention',
} as const;

/** Resolve at render time, never when producing a TanStack Query cache entry. */
export function taskStatusLabel(task: Pick<TaskItem, 'status' | 'statusCode'>, t: TFunction): string {
  return task.statusCode ? t(TASK_STATUS_KEYS[task.statusCode]) : task.status;
}

export function sessionActivityLabel(session: SessionSummary, t: TFunction): string {
  return session.activityCode
    ? t(SESSION_STATUS_KEYS[session.activityCode])
    : (session.activity?.label ?? '');
}
