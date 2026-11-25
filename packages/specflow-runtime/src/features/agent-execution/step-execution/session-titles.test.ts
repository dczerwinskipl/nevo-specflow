import { describe, expect, it } from 'vitest';

import type { WorkflowDependencies } from '@nevo/specflow-engine';

import { agentSessionTitles, shownSessionTitle } from './session-titles';

describe('agent step Session titles at read time', () => {
  it('names each agent Session by the step and attempt it was made for, with the Task title', async () => {
    const workflow = {
      store: {
        read: () =>
          Promise.resolve({
            specId: 'SPEC-1',
            manifests: [{ value: { id: 'T-1', title: 'Login form' } }],
            runs: [
              {
                value: {
                  taskId: 'T-1',
                  run: {
                    workflow: { id: 'task-flow', version: 1 },
                    attempts: [
                      {
                        sequence: 1,
                        step: 'implement',
                        attempt: 2,
                        startedAt: '2026-11-21T10:00:00Z',
                        actor: { class: 'agent', details: { sessionId: 's-1' } },
                      },
                    ],
                    returns: [],
                  },
                },
              },
            ],
          }),
      },
      catalogue: {
        workflow: () => ({ steps: [{ id: 'implement', title: 'Implement' }] }),
      },
    } as unknown as Pick<WorkflowDependencies, 'catalogue' | 'store'>;

    const titles = await agentSessionTitles(() => Promise.resolve(workflow), 'SPEC-1');

    expect(Object.fromEntries(titles)).toEqual({ 's-1': 'Implement · attempt 2 · Login form' });
  });

  it('replaces only no title or the generic one an older Session was created with', () => {
    expect(shownSessionTitle('Agent step execution', 'Implement · attempt 2')).toBe(
      'Implement · attempt 2',
    );
    expect(shownSessionTitle(undefined, 'Implement · attempt 2')).toBe('Implement · attempt 2');
    expect(shownSessionTitle('My notes', 'Implement · attempt 2')).toBe('My notes');
    expect(shownSessionTitle('Agent step execution', undefined)).toBe('Agent step execution');
  });
});
