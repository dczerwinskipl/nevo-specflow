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

  it('allows a single wait step that leads to work in a Specification workflow', () => {
    const wait: WorkflowStep = {
      kind: 'wait-for-tasks',
      id: 'wait',
      title: 'Wait',
      purpose: 'Wait.',
      transitions: [{ ...implement.transitions[0]!, target: { kind: 'step', step: 'implement' } }],
    };
    expect(
      checkWorkflow(withSteps([implement, review, wait], { subject: 'specification' })),
    ).toEqual([]);
    expect(
      checkWorkflow(
        withSteps([implement, review, { ...wait, transitions: review.transitions }], {
          subject: 'specification',
        }),
      ).map((issue) => issue.location),
    ).toContain('/steps/2/transitions');
  });

  it('rejects a wait transition that asks for feedback or reuses the Session', () => {
    const wait = (transition: Partial<WorkflowStep['transitions'][number]>): WorkflowStep => ({
      kind: 'wait-for-tasks',
      id: 'wait',
      title: 'Wait',
      purpose: 'Wait.',
      transitions: [
        {
          ...implement.transitions[0]!,
          target: { kind: 'step', step: 'implement' },
          ...transition,
        },
      ],
    });

    for (const transition of [{ feedback: 'required' }, { session: 'reuse' }] as const) {
      expect(
        checkWorkflow(
          withSteps([implement, review, wait(transition)], { subject: 'specification' }),
        ).map((issue) => issue.location),
      ).toContain('/steps/2/transitions');
    }
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
