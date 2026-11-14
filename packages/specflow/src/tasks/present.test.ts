import type { ExecutionReading } from '@nevo/specflow-engine';
import { describe, expect, it } from 'vitest';

import { listLines } from './present';

describe('tasks list', () => {
  it('prints the neutral facts of each Task and every attention item, no dashboard group', () => {
    const record = (taskId: string) => ({ taskId, title: `Title ${taskId}`, status: 'ready' });
    const reading = {
      inspection: {
        tasks: [{ record: record('base') }, { record: record('after') }, { record: record('ctx') }],
        brokenTasks: ['gone'],
      },
      facts: new Map([
        ['base', { position: { state: 'not-started' }, startable: true, startBlockers: [] }],
        [
          'after',
          {
            position: { state: 'not-started' },
            startable: false,
            startBlockers: [{ kind: 'dependencies', waitingFor: ['base'], unsatisfiable: [] }],
          },
        ],
        [
          'ctx',
          {
            position: { state: 'not-started' },
            startable: false,
            startBlockers: [{ kind: 'context-unresolved', entries: [] }],
          },
        ],
      ]),
      attention: [
        {
          subject: { kind: 'task', specId: 'spec', taskId: 'ctx' },
          reason: 'context-unresolved',
          actor: 'owner',
          action: 'edit-context',
          message: '1 required context entry does not resolve.',
        },
      ],
    } as unknown as ExecutionReading;

    expect(listLines(reading)).toEqual([
      'base  ready  not started  can start  Title base',
      'after  ready  not started  cannot start: waits for base  Title after',
      'ctx  ready  not started  cannot start: context-unresolved  Title ctx',
      'gone  broken (restore its files from Git)',
      'Task ctx: Attention (context-unresolved; owner: edit-context): 1 required context entry does not resolve.',
    ]);
  });
});
