import { describe, expect, it } from 'vitest';

import type { WorkflowDependencies } from '../../operations/loaded-execution';
import { readAgentSessionOrigins } from './sessions';

const agent = (sessionId: string) => ({
  class: 'agent',
  details: { archetype: 'planner', provider: 'claude', sessionId },
});
const owner = { class: 'human', details: { userId: 'owner' } };
const attempt = (step: string, number: number, startedAt: string, actor: unknown) => ({
  sequence: number,
  step,
  attempt: number,
  startedAt,
  actor,
});
const run = (workflow: string, attempts: unknown[]) => ({
  workflow: { id: workflow, version: 1 },
  attempts,
  returns: [],
});

/** The run records of one Specification, as the store reads them; the catalogue's step titles. */
function workflowOf(): Pick<WorkflowDependencies, 'catalogue' | 'store'> {
  const snapshot = {
    specId: 'SPEC-1',
    specification: {
      value: {
        run: run('spec-flow', [
          attempt('breakdown', 1, '2026-11-20T10:00:00Z', agent('s-spec')),
          attempt('breakdown', 2, '2026-11-20T11:00:00Z', owner),
          // A reused Session keeps the attempt it was made for.
          attempt('breakdown', 3, '2026-11-20T12:00:00Z', agent('s-spec')),
        ]),
      },
    },
    manifests: [{ value: { id: 'T-1', title: 'Login form' } }],
    runs: [
      {
        value: {
          specId: 'SPEC-1',
          taskId: 'T-1',
          run: run('task-flow', [
            attempt('implement', 1, '2026-11-21T10:00:00Z', agent('s-task')),
            attempt('gone', 1, '2026-11-21T11:00:00Z', agent('s-gone')),
          ]),
        },
      },
    ],
  };
  const definitions: Record<string, { steps: { id: string; title: string }[] }> = {
    'spec-flow': { steps: [{ id: 'breakdown', title: 'Break the solution down' }] },
    'task-flow': { steps: [{ id: 'implement', title: 'Implement' }] },
  };

  return {
    store: { read: () => Promise.resolve(snapshot) },
    catalogue: { workflow: (id: string) => definitions[id] },
  } as unknown as Pick<WorkflowDependencies, 'catalogue' | 'store'>;
}

describe('the agent attempt each agent Session was made for', () => {
  it('is read from the run records: step title, attempt and the Task, the first attempt of a reused Session', async () => {
    const origins = await readAgentSessionOrigins(workflowOf(), 'SPEC-1');

    expect(Object.fromEntries(origins)).toEqual({
      's-spec': {
        subject: { kind: 'specification', specId: 'SPEC-1' },
        step: { id: 'breakdown', title: 'Break the solution down' },
        attempt: 1,
      },
      's-task': {
        subject: { kind: 'task', specId: 'SPEC-1', taskId: 'T-1' },
        step: { id: 'implement', title: 'Implement' },
        attempt: 1,
        task: { id: 'T-1', title: 'Login form' },
      },
      // A step the pinned workflow no longer defines is named by its id.
      's-gone': {
        subject: { kind: 'task', specId: 'SPEC-1', taskId: 'T-1' },
        step: { id: 'gone', title: 'gone' },
        attempt: 1,
        task: { id: 'T-1', title: 'Login form' },
      },
    });
  });
});
