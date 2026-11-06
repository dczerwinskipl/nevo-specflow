import type { WorkflowDefinitionFile } from '@nevo/specflow-contracts/documents';
import { describe, expect, it } from 'vitest';

import { parseWorkflowFile } from './kinds';
import type { WorkflowDefinition, WorkflowStep } from './model';
import { checkWorkflow } from './workflow-rules';

const workflowFile = (): WorkflowDefinitionFile => ({
  kind: 'workflow',
  schemaVersion: 1,
  id: 'task-standard',
  version: 1,
  title: 'Standard task',
  description: 'Implement, then review.',
  subject: 'task',
  entryStep: 'implement',
  steps: [
    {
      id: 'implement',
      kind: 'work',
      title: 'Implement',
      executor: 'agent',
      archetype: 'implementer',
      purpose: 'Make the change.',
      transitions: [{ id: 'done', to: { step: 'review' }, continuation: 'auto' }],
    },
    {
      id: 'review',
      kind: 'work',
      title: 'Review',
      executor: 'agent',
      archetype: 'reviewer',
      purpose: 'Review the change.',
      transitions: [
        { id: 'accept', result: 'pass', to: { terminal: 'completed' } },
        { id: 'reject', result: 'fail', to: { step: 'implement' }, feedback: 'required' },
      ],
    },
  ],
});

const base = (): WorkflowDefinition => parseWorkflowFile(workflowFile());

const withSteps = (steps: WorkflowStep[], overrides: Partial<WorkflowDefinition> = {}) => ({
  ...base(),
  ...overrides,
  steps,
});

const [implement, review] = base().steps as [WorkflowStep, WorkflowStep];

describe('checkWorkflow', () => {
  it('accepts a coherent workflow', () => {
    expect(checkWorkflow(base())).toEqual([]);
  });

  it.each<[string, () => WorkflowDefinition, string]>([
    ['an unknown entry step', () => ({ ...base(), entryStep: 'missing' }), '/entryStep'],
    [
      'a repeated step id',
      () => withSteps([implement, { ...review, id: 'implement' }]),
      '/steps/1/id',
    ],
    [
      'a transition to an unknown step',
      () =>
        withSteps([
          {
            ...implement,
            transitions: [
              { ...implement.transitions[0]!, target: { kind: 'step', step: 'nowhere' } },
            ],
          },
          review,
        ]),
      '/steps/0/transitions/0/to/step',
    ],
    [
      'a mix of conditional and unconditional transitions',
      () =>
        withSteps([
          implement,
          { ...review, transitions: [...review.transitions, implement.transitions[0]!] },
        ]),
      '/steps/1/transitions',
    ],
    [
      'an agent step without an archetype',
      () => withSteps([{ ...implement, archetype: undefined } as WorkflowStep, review]),
      '/steps/0/archetype',
    ],
    [
      'a Task workflow that produces Tasks',
      () => withSteps([{ ...implement, produces: 'tasks' } as WorkflowStep, review]),
      '/steps/0/produces',
    ],
    [
      'a Task workflow that waits for Tasks',
      () =>
        withSteps([
          implement,
          {
            kind: 'wait-for-tasks',
            id: 'review',
            title: 'W',
            purpose: 'W',
            transitions: review.transitions,
          },
        ]),
      '/steps/1/kind',
    ],
    [
      'a reused Session for a human step',
      () =>
        withSteps([
          { ...implement, transitions: [{ ...implement.transitions[0]!, session: 'reuse' }] },
          { ...review, executor: 'human', archetype: undefined } as WorkflowStep,
        ]),
      '/steps/0/transitions/0/session',
    ],
    [
      'a return to an unknown step',
      () => ({ ...base(), returns: [{ step: 'missing', feedback: 'required', effects: [] }] }),
      '/returns/0/step',
    ],
    [
      'Task effects in a Task workflow',
      () => ({
        ...base(),
        returns: [{ step: 'implement', feedback: 'required', effects: ['approve-draft-tasks'] }],
      }),
      '/returns/0/effects',
    ],
    [
      'an escalation in a Specification workflow',
      () =>
        withSteps(
          [implement, { ...review, transitions: [{ ...review.transitions[1]!, escalate: true }] }],
          { subject: 'specification' },
        ),
      '/steps/1/transitions/0/escalate',
    ],
    [
      'an escalation without required feedback',
      () =>
        withSteps([
          implement,
          {
            ...review,
            transitions: [{ ...review.transitions[1]!, feedback: 'optional', escalate: true }],
          },
        ]),
      '/steps/1/transitions/0/escalate',
    ],
    [
      'an escalation that ends the Task',
      () =>
        withSteps([
          implement,
          {
            ...review,
            transitions: [
              { ...review.transitions[0]!, feedback: 'required', escalate: true },
              review.transitions[1]!,
            ],
          },
        ]),
      '/steps/1/transitions/0/escalate',
    ],
  ])('rejects %s', (_name, build, location) => {
    expect(checkWorkflow(build()).map((issue) => issue.location)).toContain(location);
  });

  it('accepts an escalation with feedback to a step of a Task workflow', () => {
    const escalation = {
      ...review.transitions[1]!,
      id: 'escalated',
      result: 'spec',
      escalate: true,
    };

    expect(
      checkWorkflow(
        withSteps([implement, { ...review, transitions: [...review.transitions, escalation] }]),
      ),
    ).toEqual([]);
  });

  describe('wait steps', () => {
    type Transition = WorkflowStep['transitions'][number];
    const finished: Transition = {
      ...implement.transitions[0]!,
      id: 'finished',
      target: { kind: 'step', step: 'implement' },
    };
    const escalated: Transition = {
      ...finished,
      id: 'escalated',
      on: 'task-escalated',
      feedback: 'required',
    };
    const waitWith = (...transitions: Transition[]): WorkflowStep => ({
      kind: 'wait-for-tasks',
      id: 'wait',
      title: 'Wait',
      purpose: 'Wait.',
      transitions,
    });
    const locations = (wait: WorkflowStep) =>
      checkWorkflow(withSteps([implement, review, wait], { subject: 'specification' })).map(
        (issue) => issue.location,
      );

    it('allows a tasks-finished transition, with or without its trigger, and a task-escalated one', () => {
      expect(locations(waitWith(finished))).toEqual([]);
      expect(locations(waitWith({ ...finished, on: 'tasks-finished' }, escalated))).toEqual([]);
      expect(locations(waitWith(escalated, finished))).toEqual([]);
    });

    it.each<[string, Transition[], string]>([
      ['a result', [{ ...finished, result: 'pass' }], '/steps/2/transitions/0'],
      ['a reused Session', [{ ...finished, session: 'reuse' }], '/steps/2/transitions/0'],
      [
        'feedback on tasks-finished',
        [{ ...finished, feedback: 'required' }],
        '/steps/2/transitions/0/feedback',
      ],
      ['no tasks-finished transition', [escalated], '/steps/2/transitions'],
      [
        'two transitions on one trigger',
        [finished, escalated, { ...escalated, id: 'again' }],
        '/steps/2/transitions/2/on',
      ],
      [
        'a task-escalated transition without required feedback',
        [finished, { ...escalated, feedback: 'optional' }],
        '/steps/2/transitions/1/on',
      ],
      [
        'a task-escalated transition to a terminal',
        [finished, { ...escalated, target: { kind: 'terminal', outcome: 'abandoned' } }],
        '/steps/2/transitions/1/on',
      ],
    ])('rejects %s', (_name, transitions, location) => {
      expect(locations(waitWith(...transitions))).toContain(location);
    });

    it('rejects a wait transition to another wait step', () => {
      const other = { ...waitWith(finished), id: 'other' };
      const wait = waitWith({ ...finished, target: { kind: 'step', step: 'other' } });

      expect(
        checkWorkflow(
          withSteps([implement, review, wait, other], { subject: 'specification' }),
        ).map((issue) => issue.location),
      ).toContain('/steps/2/transitions/0');
    });

    it('rejects a trigger on a work-step transition', () => {
      expect(
        checkWorkflow(
          withSteps([
            { ...implement, transitions: [{ ...implement.transitions[0]!, on: 'tasks-finished' }] },
            review,
          ]),
        ).map((issue) => issue.location),
      ).toEqual(['/steps/0/transitions/0/on']);
    });

    it('defaults the trigger of a wait-step transition read from a file', () => {
      const parsed = parseWorkflowFile({
        ...workflowFile(),
        subject: 'specification',
        steps: [
          ...workflowFile().steps,
          {
            id: 'wait',
            kind: 'wait-for-tasks',
            title: 'Wait',
            purpose: 'Wait.',
            transitions: [{ id: 'finished', to: { step: 'implement' } }],
          },
        ],
      });

      expect(parsed.steps[2]?.transitions[0]?.on).toBe('tasks-finished');
      expect(parsed.steps[0]?.transitions[0]?.on).toBeUndefined();
    });
  });

  it('rejects an entry step that is a wait step', () => {
    const wait: WorkflowStep = {
      kind: 'wait-for-tasks',
      id: 'wait',
      title: 'Wait',
      purpose: 'Wait.',
      transitions: [{ ...implement.transitions[0]!, target: { kind: 'step', step: 'implement' } }],
    };

    expect(
      checkWorkflow(
        withSteps([implement, review, wait], { subject: 'specification', entryStep: 'wait' }),
      ),
    ).toEqual([expect.objectContaining({ location: '/entryStep' })]);
  });

  it('rejects a return to a wait step, which nobody could start', () => {
    const wait: WorkflowStep = {
      kind: 'wait-for-tasks',
      id: 'wait',
      title: 'Wait',
      purpose: 'Wait.',
      transitions: [{ ...implement.transitions[0]!, target: { kind: 'step', step: 'implement' } }],
    };

    expect(
      checkWorkflow(
        withSteps([implement, review, wait], {
          subject: 'specification',
          returns: [{ step: 'wait', feedback: 'required', effects: [] }],
        }),
      ),
    ).toEqual([expect.objectContaining({ location: '/returns/0/step' })]);
  });
});
