import { vi } from 'vitest';
import type {
  AssociatedSpecification,
  AssociatedTask,
  AssociationTargets,
  TargetFact,
} from '../../src/features/session-associations';

const specifications: Record<string, AssociatedSpecification> = {
  S: { specId: 'S', key: 'S-1', title: 'Specification S', collection: 'current' },
  T: { specId: 'T', title: 'Specification T', collection: 'current' },
  A: { specId: 'A', title: 'Archived A', collection: 'archived' },
};
const tasks: Record<string, Record<string, AssociatedTask>> = {
  S: {
    'TASK-01': { taskId: 'TASK-01', title: 'First' },
    'TASK-02': { taskId: 'TASK-02', title: 'Second' },
  },
  T: { 'TASK-T1': { taskId: 'TASK-T1', title: 'Of T' } },
};

function specification(specId: string): TargetFact<AssociatedSpecification> {
  if (specId === 'broken') {
    return { state: 'unavailable' };
  }

  const value = specifications[specId];

  return value ? { state: 'available', value } : { state: 'missing' };
}

function task(specId: string, taskId: string): TargetFact<AssociatedTask> {
  if (taskId === 'TASK-BROKEN') {
    return { state: 'unavailable' };
  }

  const value = tasks[specId]?.[taskId];

  return value ? { state: 'available', value } : { state: 'missing' };
}

/**
 * Engine facts for the association module without an Engine: Specifications `S`, `T` (current) and
 * `A` (archived); `broken` and Task `TASK-BROKEN` are unreadable; everything else is missing. Every
 * method is a spy, so a test can prove that no lookup happened.
 */
export function associationTargets(
  overrides: { specification?: Record<string, TargetFact<AssociatedSpecification>> } = {},
) {
  return {
    specification: vi.fn((specId: string) =>
      Promise.resolve(overrides.specification?.[specId] ?? specification(specId)),
    ),
    tasks: vi.fn((specId: string, taskIds: readonly string[]) =>
      Promise.resolve(taskIds.map((taskId) => task(specId, taskId))),
    ),
    workspaces: vi.fn((specIds: readonly string[]) =>
      Promise.resolve(new Map(specIds.map((specId) => [specId, 'workspace']))),
    ),
  } satisfies AssociationTargets;
}
