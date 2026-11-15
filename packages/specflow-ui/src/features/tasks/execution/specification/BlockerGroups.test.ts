import { describe, expect, it } from 'vitest';
import type { ExitBlocker } from '@nevo/specflow-contracts/workflow';
import { createSpecFlowI18n } from '../../../../i18n';
import { closeReasons } from './BlockerGroups';

const i18n = createSpecFlowI18n('en');
const blockers: ExitBlocker[] = [
  { kind: 'specification-run', subjectIds: ['spec'], message: '' },
  { kind: 'unfinished-tasks', subjectIds: ['t-1', 't-2'], message: '' },
];
const tasks = new Map([
  ['t-1', { id: 't-1', title: 'One', state: 'Draft' }],
  ['t-2', { id: 't-2', title: 'Two', state: 'In progress' }],
]);

describe('why a Specification cannot close', () => {
  it('waits for the unfinished Tasks only on the wait step', () => {
    expect(
      closeReasons(i18n.t, 'en', blockers, tasks, {
        stepTitle: 'Waiting for tasks',
        waiting: true,
      }),
    ).toBe('its workflow is waiting for 2 unfinished tasks');
  });

  it('names the step the workflow is still at, and the unfinished Tasks apart', () => {
    expect(
      closeReasons(i18n.t, 'en', blockers, tasks, {
        stepTitle: 'Break the solution down',
        waiting: false,
      }),
    ).toBe('its workflow is still at “Break the solution down” and 2 tasks are unfinished');
  });
});
