import type {
  AbandonSpecificationResult,
  ActionProjection,
  FinishStepResult,
  StartResult,
} from '@nevo/specflow-engine';
import { describe, expect, it } from 'vitest';

import {
  abandonLines,
  actionLines,
  confirmLines,
  contextLines,
  exitLines,
  finishLines,
  positionLine,
  rejectLines,
  startLines,
} from './present';

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
        next: {
          step: { id: 'implement' },
          human: true,
          agent: {
            kind: 'available',
            launch: {
              archetype: 'implementer',
              provider: 'claude',
              model: 'claude-sonnet-5-5',
              session: { mode: 'fresh' },
            },
          },
        },
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

  it('names steps by title and id, and where a transition and a return lead', () => {
    const projection = {
      subject,
      position: {
        kind: 'active',
        step: { id: 'implement', title: 'Implement' },
        attempt: { number: 1, startedAt: 'now', actor: { class: 'human', details: {} } },
      },
      actions: {
        finish: {
          step: 'implement',
          attempt: 1,
          transitions: [{ id: 'implemented', targetTitle: 'Review', feedback: 'optional' }],
        },
        return: {
          targets: [{ step: 'implement', title: 'Implement', feedback: 'required' }],
        },
      },
    } as unknown as ActionProjection;

    expect(actionLines(projection)).toEqual([
      'Task build',
      'State: active on Implement (implement) (attempt 1)',
      'Worked by: human',
      'Action: finish "implement" attempt 1 (implemented, to Review)',
      'Action: return to Implement (implement) (reason required)',
    ]);
  });

  it('lists the gates of a finish transition under it', () => {
    const projection = {
      subject,
      position: {
        kind: 'active',
        step: { id: 'implement' },
        attempt: { number: 1, startedAt: 'now', actor: { class: 'human', details: {} } },
      },
      actions: {
        finish: {
          step: 'implement',
          attempt: 1,
          transitions: [
            {
              id: 'implemented',
              feedback: 'optional',
              unavailable: 'gate-unsatisfied',
              gates: [
                {
                  id: 'findings',
                  type: 'document',
                  label: 'Findings written',
                  documentType: 'research',
                  scope: { kind: 'task', specId: 'spec', taskId: 'build' },
                  status: 'unsatisfied',
                  reason: 'sections-missing',
                  documentId: 'notes',
                  missingSections: ['Findings'],
                },
              ],
            },
          ],
        },
      },
    } as unknown as ActionProjection;

    expect(actionLines(projection).slice(-2)).toEqual([
      'Action: finish "implement" attempt 1 (implemented, unavailable: gate-unsatisfied)',
      '  [ ] gate findings: Findings written, research in Task build (document notes lacks: Findings)',
    ]);
  });

  it('names the open Tasks under a completing transition they refuse', () => {
    const projection = {
      subject,
      position: {
        kind: 'active',
        step: { id: 'acceptance' },
        attempt: { number: 1, startedAt: 'now', actor: { class: 'human', details: {} } },
      },
      actions: {
        finish: {
          step: 'acceptance',
          attempt: 1,
          transitions: [
            {
              id: 'accepted',
              feedback: 'optional',
              unavailable: 'tasks-open',
              openTasks: [
                { taskId: 'api', cause: 'active' },
                { taskId: 'screen', cause: 'waiting' },
              ],
            },
          ],
        },
      },
    } as unknown as ActionProjection;

    expect(actionLines(projection).slice(-4)).toEqual([
      'Action: finish "acceptance" attempt 1 (accepted, unavailable: tasks-open)',
      '  open task api: active',
      '  open task screen: waiting',
      '  hint: finish or cancel these Tasks first, or finish with --task-decisions-file cancelling them (the finish then completes)',
    ]);
  });
});

describe('startLines', () => {
  it('says before the work that a step producing Tasks finishes with all its drafts', () => {
    const result = {
      kind: 'started',
      subject: { kind: 'specification', specId: 'spec' },
      context: {
        step: { id: 'breakdown', title: 'Break the solution down', purpose: 'Draft Tasks.' },
        attempt: 2,
        finish: {
          transitions: [{ id: 'proposed', feedback: 'optional', targetTitle: 'Review' }],
          tasks: { rule: 'List every draft Task.' },
        },
      },
    } as unknown as StartResult;

    expect(startLines(result).at(-1)).toBe(
      'Finish needs: --tasks-file <path>. List every draft Task.',
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

  it('shows a post action that failed', () => {
    const result = {
      subject,
      transition: 'implemented',
      position: { state: 'ready', step: 'review' },
      continuation: { kind: 'none', reason: 'on-hold' },
      createdTasks: [],
      postActions: [
        {
          action: 'commit-execution-state',
          status: 'failed',
          code: 'MANUAL_COMMIT_CONFLICT',
          message: 'A path was edited.',
        },
      ],
    } as unknown as FinishStepResult;

    expect(finishLines(result).at(-1)).toBe(
      'Post action commit-execution-state failed: MANUAL_COMMIT_CONFLICT A path was edited.',
    );
  });

  it('shows the workflow state a commit left uncommitted because it was edited', () => {
    const result = {
      subject,
      transition: 'implemented',
      position: { state: 'ready', step: 'review' },
      continuation: { kind: 'none', reason: 'on-hold' },
      createdTasks: [],
      postActions: [
        {
          action: 'commit-execution-state',
          status: 'completed',
          held: { edited: ['tasks/a/task.md'], paths: ['tasks/a/task.md', 'tasks/index.yaml'] },
        },
      ],
    } as unknown as FinishStepResult;

    expect(finishLines(result).at(-1)).toBe(
      'Workflow state left uncommitted (2 files), edited outside the Engine since it wrote them: ' +
        'tasks/a/task.md. Commit them with Git; Close takes them otherwise.',
    );
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

describe('contextLines', () => {
  it('lists documents, types and the Task context by digest', () => {
    const context = {
      subject,
      step: { id: 'implement', title: 'Implement' },
      attempt: 1,
      agent: {
        documents: [
          { id: 'overview', type: 'overview', path: 'specs/a/overview.md', templateOnly: true },
        ],
        documentTypes: [
          {
            id: 'decisions',
            title: 'Decisions',
            useWhen: 'a choice is made',
            defaultFilename: 'decisions.md',
          },
        ],
        taskContext: {
          digest: 'd1',
          entries: [
            {
              kind: 'path',
              ref: 'src/a.ts',
              path: 'src/a.ts',
              sha256: 'a'.repeat(64),
              bytes: 3,
              required: true,
            },
            { kind: 'instructions', text: 'Be brief.', required: false },
          ],
        },
      },
    } as unknown as Parameters<typeof contextLines>[0];

    expect(contextLines(context)).toEqual([
      'Context: Task build, step Implement (implement) (attempt 1)',
      'Documents (1):',
      '  overview [overview] specs/a/overview.md (template only)',
      'Document types you may register (documents add --type <id>):',
      '  decisions: Decisions. Use when a choice is made (default decisions.md)',
      'Task context (digest d1):',
      '  path src/a.ts -> src/a.ts sha256:aaaaaaaaaaaa 3 bytes',
      '  instructions (optional): Be brief.',
    ]);
  });
});

describe('an agent result that waits for the owner (D17)', () => {
  const spec = { kind: 'specification', specId: 'spec' } as const;

  it('shows the proposal, what Confirm applies and both owner actions', () => {
    const projection = {
      subject: spec,
      position: {
        kind: 'awaiting-confirmation',
        step: { id: 'breakdown-review', title: 'Review the breakdown' },
        attempt: { number: 1, startedAt: 'then', endedAt: 'now', actor: { class: 'agent' } },
        proposal: {
          transition: {
            id: 'approved',
            result: 'pass',
            label: 'Approve',
            targetTitle: 'Implementation',
            feedback: 'optional',
          },
          feedback: 'Both Tasks are ready.',
          artifacts: [],
        },
        confirms: { approvesDrafts: ['api', 'screen'] },
        confirmsDigest: 'd'.repeat(64),
      },
      actions: {
        confirm: { step: 'breakdown-review', attempt: 1 },
        reject: { step: 'breakdown-review', attempt: 1 },
      },
    } as unknown as ActionProjection;

    expect(actionLines(projection)).toEqual([
      'Specification',
      'State: waiting for your confirmation of Review the breakdown (breakdown-review) (attempt 1)',
      'The agent proposes: Approve, to Implementation',
      'Feedback: Both Tasks are ready.',
      'Confirming approves 2 draft Tasks: api, screen',
      `Action: confirm "breakdown-review" attempt 1 --confirms-digest ${'d'.repeat(64)}`,
      'Action: reject "breakdown-review" attempt 1 --feedback <text>',
    ]);
  });

  it('says once that the workflow waits for an agent attempt’s commit, and how to retry it', () => {
    const waiting = (reason: string, code?: string) => {
      const unavailable = { reason, ...(code ? { code } : {}) };

      return {
        subject: spec,
        position: {
          kind: 'ready',
          next: {
            step: { id: 'specification', title: 'Write the Specification' },
            human: true,
            agent: { kind: 'unavailable', reason },
          },
        },
        actions: {
          start: { step: 'specification', firstStart: false, unavailable },
          return: {
            targets: [{ step: 'requirements', title: 'Requirements', feedback: 'optional' }],
            unavailable,
          },
        },
        attemptCommit: {
          ...unavailable,
          attemptId: 'attempt-1',
          subject: { specId: spec.specId, taskId: 'api' },
          step: 'implement',
          attempt: 2,
          stepTitle: 'Implement',
        },
      } as unknown as ActionProjection;
    };

    const failed = actionLines(waiting('attempt-commit-failed', 'MANUAL_COMMIT_CONFLICT'));
    expect(failed.filter((line) => line.startsWith('Action:'))).toEqual([]);
    expect(failed.at(-1)).toBe(
      `Nothing of this Specification's workflow changes until the commit of the agent's work in implement#2 of Task api ran (attempt-commit-failed, MANUAL_COMMIT_CONFLICT): it failed; fix the cause, then retry it. Action: retry-commit ${spec.specId} --task api --step implement --attempt 2`,
    );
    expect(actionLines(waiting('attempt-commit-pending')).at(-1)).toBe(
      `Nothing of this Specification's workflow changes until the commit of the agent's work in implement#2 of Task api ran (attempt-commit-pending): it has not run (an interruption); retry it if it does not end by itself. Action: retry-commit ${spec.specId} --task api --step implement --attempt 2`,
    );
  });

  it('reports a Confirm with the owner’s commit and a Reject of committed work', () => {
    expect(
      confirmLines({
        subject: spec,
        transition: 'approved',
        position: { state: 'active', step: 'implementation', attempt: 1 },
        continuation: { kind: 'none', reason: 'waiting-for-tasks' },
        postActions: [
          {
            action: 'commit-execution-state',
            status: 'completed',
            commit: { sha: 'abc123', paths: ['a', 'b'] },
          },
        ],
      }),
    ).toEqual([
      'Confirmed: Specification via "approved"',
      'Position: active on "implementation" (attempt 1)',
      'Next: nothing follows (waiting-for-tasks)',
    ]);
    expect(
      rejectLines({
        subject: spec,
        position: { state: 'ready', step: 'breakdown-review' },
        continuation: { kind: 'attention', step: 'breakdown-review', reason: 'owner-action' },
        replayed: true,
        postActions: [],
      }),
    ).toEqual([
      "Already rejected: Specification; the agent's work was committed with its attempt",
      'Position: ready to start "breakdown-review"',
      'Next: needs the owner: "breakdown-review" (owner-action)',
    ]);
    expect(
      positionLine({ state: 'awaiting-confirmation', step: 'breakdown-review', attempt: 1 }),
    ).toBe('waiting for the owner to confirm the result of "breakdown-review" (attempt 1)');
  });
});
