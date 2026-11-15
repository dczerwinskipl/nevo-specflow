import { describe, expect, it } from 'vitest';

import { checkDefinition, type WorkflowDefinition } from '../definitions/definition';
import { createTestHost } from './host.test-support';
import type { ActorRecord } from './run';

/** Work, then a wait step completed by a host event; a return may reopen the work step. */
const DEFINITION: WorkflowDefinition = {
  id: 'host-example',
  version: 1,
  title: 'Host example',
  description: 'Work, wait for an event, finish.',
  entryStep: 'work',
  annotations: {},
  steps: [
    {
      id: 'work',
      kind: 'work',
      title: 'Work',
      purpose: 'Do it.',
      executors: ['agent', 'human'],
      annotations: {},
      transitions: [
        {
          id: 'done',
          target: { kind: 'step', step: 'wait' },
          continuation: 'auto',
          feedback: 'optional',
          annotations: {},
        },
      ],
    },
    {
      id: 'wait',
      kind: 'wait',
      title: 'Wait',
      purpose: 'Wait for the host.',
      annotations: {},
      transitions: [
        {
          id: 'arrived',
          on: 'arrived',
          target: { kind: 'terminal', outcome: 'completed' },
          continuation: 'auto',
          feedback: 'optional',
          annotations: {},
        },
      ],
    },
  ],
  returns: [{ step: 'work', feedback: 'required', annotations: {} }],
};

const AT = '2026-11-12T10:00:00.000Z';
const person: ActorRecord = { class: 'human', details: { id: 'owner' } };

describe('a host with two independent Runs of one definition', () => {
  it('drives each through work, wait, finish, return, replay and reload', () => {
    expect(checkDefinition(DEFINITION)).toEqual([]);
    const host = createTestHost(DEFINITION);
    host.begin('spec-a/task-1');
    host.begin('spec-a/task-2');

    // Both start and finish the work step; the second stays behind in its wait step.
    for (const key of ['spec-a/task-1', 'spec-a/task-2']) {
      expect(host.apply(key, { kind: 'start', at: AT, actor: person }).intent).toMatchObject({
        kind: 'execute',
        step: 'work',
        attempt: 1,
      });
      expect(
        host.apply(key, { kind: 'finish', at: AT, step: 'work', attempt: 1, actor: person }).intent,
      ).toMatchObject({ kind: 'await-event', step: 'wait', triggers: ['arrived'] });
    }

    // An event for task-1 completes only task-1.
    expect(host.apply('spec-a/task-1', { kind: 'event', at: AT, name: 'arrived' }).intent).toEqual({
      kind: 'terminal',
      outcome: 'completed',
    });
    expect(host.reload('spec-a/task-1').position).toMatchObject({ state: 'terminal' });
    expect(host.reload('spec-a/task-2').position).toMatchObject({ state: 'active', step: 'wait' });

    // task-2 returns to the work step; the reloaded Run continues with attempt 2.
    expect(
      host.apply('spec-a/task-2', { kind: 'return', at: AT, step: 'work', feedback: 'Again.' })
        .intent,
    ).toMatchObject({ kind: 'ready', step: 'work' });
    expect(host.reload('spec-a/task-2').attempts.at(-1)?.outcome).toMatchObject({
      kind: 'returned',
      to: 'work',
    });
    expect(
      host.apply('spec-a/task-2', { kind: 'start', at: AT, actor: person }).intent,
    ).toMatchObject({ kind: 'execute', step: 'work', attempt: 2 });
  });
});
