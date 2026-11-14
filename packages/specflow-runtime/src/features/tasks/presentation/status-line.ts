import type { TaskFacts } from '@nevo/specflow-engine';
import type { TaskListRow } from '@nevo/specflow-contracts/tasks';

import { groupingFactsOf } from './grouping-facts';

export type TaskStatusLine = TaskListRow['status'];

/**
 * The status line of a Task, derived from its neutral facts (never from a group): preparation
 * first, then the run, then whether it can start.
 */
export function taskStatusOf(facts: TaskFacts): TaskStatusLine {
  const grouping = groupingFactsOf(facts);
  if (facts.preparation === 'cancelled') {
    return { id: 'cancelled', label: 'Cancelled', lifecycle: 'blocked' };
  }

  if (grouping.outcome === 'completed') {
    return { id: 'completed', label: 'Completed', lifecycle: 'completed' };
  }

  if (grouping.outcome === 'abandoned') {
    return { id: 'abandoned', label: 'Abandoned', lifecycle: 'blocked' };
  }

  if (facts.preparation === 'draft') {
    return { id: 'draft', label: 'Draft', lifecycle: 'pending' };
  }

  if (facts.preparation === 'on-hold') {
    return { id: 'on-hold', label: 'On hold', lifecycle: 'blocked' };
  }

  if (grouping.position === 'active' || grouping.position === 'ready') {
    return { id: 'in-progress', label: 'In progress', lifecycle: 'in_progress' };
  }

  if (facts.startable) {
    return { id: 'ready', label: 'Ready', lifecycle: 'pending' };
  }

  return grouping.waiting
    ? { id: 'waiting', label: 'Waiting', lifecycle: 'pending' }
    : { id: 'blocked', label: 'Cannot start', lifecycle: 'blocked' };
}
