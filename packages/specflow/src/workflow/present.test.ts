import type {
  AbandonSpecificationResult,
  ActionProjection,
  FinishStepResult,
} from '@nevo/specflow-engine';
import { describe, expect, it } from 'vitest';

import { abandonLines, actionLines, exitLines, finishLines, positionLine } from './present';

const subject = { kind: 'task', specId: 'spec', taskId: 'build' } as const;

describe('actionLines', () => {
  it('lists a first start with the pin the owner confirms', () => {
    const projection = {
      subject,
      workflow: { workflowId: 'task-standard', version: 1, revision: 'r1', title: 'Standard' },
      position: {
        kind: 'not-started',
        preview: {
          workflowId: 'task-standard',
          version: 1,
          revision: 'r1',
          title: 'Standard',
          firstStep: 'implement',
        },
        next: { step: { id: 'implement' }, human: true, agent: { kind: 'available' } },
      },
      actions: { start: { step: 'implement', firstStart: true, expectedWorkflowRevision: 'r1' } },
    } as unknown as ActionProjection;

    expect(actionLines(projection)).toEqual([
      'Task build',
      'Workflow: task-standard (revision r1)',
      'State: not started; a first start pins task-standard (revision r1)',
      'Next step: implement',
      'Action: start "implement" (--expected-workflow-revision r1)',
    ]);
  });

  it('lists each finish transition with its result and required feedback', () => {
    const projection = {
      subject,
      position: {
        kind: 'active',
        step: { id: 'review' },
        attempt: { number: 2, startedAt: 'now', actor: { class: 'human', details: {} } },
      },
      actions: {
        finish: {
          step: 'review',
          attempt: 2,
          transitions: [
            { id: 'approved', result: 'pass', feedback: 'optional' },
            { id: 'changes-requested', result: 'fail', feedback: 'required' },
          ],
        },
      },
    } as unknown as ActionProjection;

    const lines = actionLines(projection);
    expect(lines).toContain('Action: finish "review" attempt 2 --result pass (approved)');
    expect(lines).toContain(
      'Action: finish "review" attempt 2 --result fail (changes-requested, feedback required)',
    );
  });
});

describe('finishLines', () => {
  it('says when a finish was a replay and what follows', () => {
    const result = {
      subject,
      transition: 'implemented',
      position: { state: 'ready', step: 'review' },
      continuation: { kind: 'attention', step: 'review', reason: 'owner-action' },
      createdTasks: [],
      replayed: true,
    } as unknown as FinishStepResult;

    expect(finishLines(result)).toEqual([
      'Already finished: Task build via "implemented"',
      'Position: ready to start "review"',
      'Next: needs the owner: "review" (owner-action)',
    ]);
  });
});

describe('exit lines', () => {
  const blocked = {
    subject: { kind: 'specification', specId: 'spec' },
    position: { kind: 'terminal', outcome: 'completed' },
    actions: {},
    specification: {
      createTask: { kind: 'allowed' },
      exit: {
        close: {
          kind: 'blocked',
          blockers: [
            { kind: 'draft-tasks', subjectIds: ['a', 'b'], message: 'Approve or cancel these.' },
          ],
        },
        abandon: { kind: 'allowed' },
      },
    },
  } as unknown as ActionProjection;

  it('lists Close with what holds it and Abandon with its command', () => {
    expect(actionLines(blocked).slice(-4)).toEqual([
      'State: ended (completed)',
      'Close: blocked',
      '  held by draft-tasks (a, b): Approve or cancel these.',
      'Abandon: allowed ("specs abandon <spec-id> --reason <text> --yes")',
    ]);
  });

  it('says why Abandon is unavailable or blocked', () => {
    const closeAllowed = 'Close: allowed (Git and workspace rules are checked by the close itself)';

    expect(
      exitLines({ close: { kind: 'allowed' }, abandon: { kind: 'unavailable', reason: 'ended' } }),
    ).toEqual([closeAllowed, 'Abandon: unavailable (ended)']);
    expect(
      exitLines({
        close: { kind: 'allowed' },
        abandon: {
          kind: 'blocked',
          blockers: [{ kind: 'broken-tasks', subjectIds: ['x'], message: 'Restore them.' }],
        },
      }),
    ).toEqual([closeAllowed, 'Abandon: blocked', '  held by broken-tasks (x): Restore them.']);
  });
});

describe('abandonLines', () => {
  it('lists the cancelled Tasks and the ended runs', () => {
    expect(
      abandonLines({
        specId: 'spec',
        abandonment: { reason: 'Not needed' },
        cancelledTasks: ['docs'],
        abandonedTaskRuns: [],
      } as unknown as AbandonSpecificationResult),
    ).toEqual([
      'Abandoned: Specification spec',
      'Reason: Not needed',
      'Cancelled Tasks: docs',
      'Ended Task runs: none',
    ]);
  });
});

describe('positionLine', () => {
  it('names the terminal outcome', () => {
    expect(positionLine({ state: 'terminal', outcome: 'completed' })).toBe('ended: completed');
  });
});
