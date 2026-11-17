import type { TaskResourceFacts } from '@nevo/specflow-contracts/tasks';

/** A ready Task resource that has not started, for fixtures that need a Task read. */
export function taskResourceFixture(overrides: Partial<TaskResourceFacts> = {}): TaskResourceFacts {
  return {
    revision: 'manifest-1',
    type: 'implementation',
    status: 'ready',
    dependsOn: [],
    origin: { kind: 'manual', actorId: 'user:demo' },
    documents: [{ id: 'task', path: 'task.md', type: 'task' }],
    context: null,
    readiness: { kind: 'ready' },
    facts: {
      preparation: 'ready',
      escalated: false,
      position: { state: 'not-started' },
      startable: true,
      startBlockers: [],
      definitionChanged: false,
    },
    position: { state: 'not-started' },
    definitionChanged: false,
    ...overrides,
  };
}
