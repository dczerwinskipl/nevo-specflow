import { describe, expect, it } from 'vitest';

import { decide, type WorkflowCommand } from './coordinator';
import { checkDefinition, type WorkflowDefinition } from './definition';
import { handoffOf, isPositionJustified } from './replay';
import { newRun, type ActorRecord, type WorkflowRun } from './run';

/**
 * A host that is not SpecFlow: a draft (agent or person), a human-only review gate, and a wait step
 * completed by host events the core does not know.
 */
const DEFINITION: WorkflowDefinition = {
  id: 'publish',
  version: 1,
  title: 'Publish',
  description: 'Draft, review, wait for the items.',
  entryStep: 'draft',
  annotations: {},
  steps: [
    {
      id: 'draft',
      kind: 'work',
      title: 'Draft',
      purpose: 'Write it.',
      executors: ['agent', 'human'],
      annotations: {},
      transitions: [
        {
          id: 'drafted',
          target: { kind: 'step', step: 'review' },
          continuation: 'auto',
          feedback: 'optional',
          annotations: {},
        },
      ],
    },
    {
      id: 'review',
      kind: 'work',
      title: 'Review',
      purpose: 'Sign off.',
      executors: ['human'],
      annotations: {},
      transitions: [
        {
          id: 'pass',
          result: 'pass',
          target: { kind: 'step', step: 'collect' },
          continuation: 'owner-action',
          feedback: 'optional',
          annotations: {},
        },
        {
          id: 'fail',
          result: 'fail',
          target: { kind: 'step', step: 'draft' },
          continuation: 'auto',
          feedback: 'required',
          annotations: {},
        },
      ],
    },
    {
      id: 'collect',
      kind: 'wait',
      title: 'Collect',
      purpose: 'Wait for the items.',
      annotations: {},
      transitions: [
        {
          id: 'collected',
          on: 'items-done',
          target: { kind: 'terminal', outcome: 'completed' },
          continuation: 'auto',
          feedback: 'optional',
          annotations: {},
        },
        {
          id: 'stopped',
          on: 'item-stopped',
          target: { kind: 'step', step: 'draft' },
          continuation: 'owner-action',
          feedback: 'required',
          annotations: {},
        },
      ],
    },
  ],
  returns: [{ step: 'draft', feedback: 'required', annotations: {} }],
};

const AT = '2026-11-11T10:00:00.000Z';
const agent: ActorRecord = { class: 'agent', details: { provider: 'p', sessionId: 's1' } };
const person: ActorRecord = { class: 'human', details: { id: 'owner' } };

const start = (actor: ActorRecord): WorkflowCommand => ({ kind: 'start', at: AT, actor });
const finish = (
  step: string,
  attempt: number,
  actor: ActorRecord,
  extra: Partial<Extract<WorkflowCommand, { kind: 'finish' }>> = {},
): WorkflowCommand => ({ kind: 'finish', at: AT, step, attempt, actor, ...extra });

/** Apply commands in order, each on the run the previous one decided. */
function run(...commands: WorkflowCommand[]): WorkflowRun {
  return commands.reduce<WorkflowRun>(
    (current, command) => decide(DEFINITION, current, command).nextRun,
    newRun(DEFINITION),
  );
}

const draftedByAgent = [start(agent), finish('draft', 1, agent)];
const inWait = [...draftedByAgent, start(person), finish('review', 1, person, { result: 'pass' })];

describe('the neutral definition rules', () => {
  it('accept the example and name broken rules', () => {
    expect(checkDefinition(DEFINITION)).toEqual([]);
    const broken: WorkflowDefinition = {
      ...DEFINITION,
      entryStep: 'collect',
      steps: DEFINITION.steps.map((step) =>
        step.kind === 'work' ? { ...step, executors: [] } : step,
      ),
      returns: [{ step: 'collect', feedback: 'optional', annotations: {} }],
    };
    expect(checkDefinition(broken).map((problem) => problem.location)).toEqual([
      '/entryStep',
      '/steps/0/executors',
      '/steps/1/executors',
      '/returns/0/step',
    ]);
  });
});

describe('decide', () => {
  it.each<[string, WorkflowCommand[], WorkflowCommand, object]>([
    [
      'start activates the entry step',
      [],
      start(agent),
      { kind: 'execute', step: 'draft', attempt: 1, resumed: false },
    ],
    [
      'a repeated start resumes',
      [start(agent)],
      start(agent),
      { kind: 'execute', step: 'draft', attempt: 1, resumed: true },
    ],
    [
      'a finish makes the next step ready',
      [start(agent)],
      finish('draft', 1, agent),
      { kind: 'ready', step: 'review', continuation: 'auto' },
    ],
    [
      'a finish into a wait step enters it',
      [...draftedByAgent, start(person)],
      finish('review', 1, person, { result: 'pass' }),
      {
        kind: 'await-event',
        step: 'collect',
        attempt: 1,
        triggers: ['items-done', 'item-stopped'],
      },
    ],
    [
      'an event completes the wait step',
      inWait,
      { kind: 'event', at: AT, name: 'items-done' },
      { kind: 'terminal', outcome: 'completed' },
    ],
    [
      'an undeclared event leaves it waiting',
      inWait,
      { kind: 'event', at: AT, name: 'other' },
      { kind: 'await-event', step: 'collect' },
    ],
    [
      'a return makes a reached step ready for the owner',
      inWait,
      { kind: 'return', at: AT, step: 'draft', feedback: 'Again.' },
      { kind: 'ready', step: 'draft', continuation: 'owner-action' },
    ],
  ])('%s', (_name, before, command, intent) => {
    const decision = decide(DEFINITION, run(...before), command);
    expect(decision.intent).toMatchObject(intent);
    expect(isPositionJustified(decision.nextRun, DEFINITION)).toBe(true);
  });

  it.each<[string, WorkflowCommand[], WorkflowCommand, string]>([
    [
      'an agent on the human-only gate',
      draftedByAgent,
      start(agent),
      'WORKFLOW_EXECUTOR_NOT_ALLOWED',
    ],
    [
      'a person finishing the agent attempt',
      [start(agent)],
      finish('draft', 1, person),
      'WORKFLOW_EXECUTOR_NOT_ALLOWED',
    ],
    [
      'an agent resuming a person attempt',
      [start(person)],
      start(agent),
      'WORKFLOW_EXECUTOR_NOT_ALLOWED',
    ],
    ['a start of a wait step', inWait, start(agent), 'WORKFLOW_POSITION_INVALID'],
    ['a finish of a wait step', inWait, finish('collect', 1, agent), 'WORKFLOW_POSITION_INVALID'],
    [
      'a finish of another attempt',
      [start(agent)],
      finish('draft', 2, agent),
      'WORKFLOW_ATTEMPT_MISMATCH',
    ],
    [
      'a finish without an active step',
      draftedByAgent,
      finish('review', 1, person, { result: 'pass' }),
      'WORKFLOW_POSITION_INVALID',
    ],
    [
      'an unknown result',
      [...draftedByAgent, start(person)],
      finish('review', 1, person, { result: 'maybe' }),
      'WORKFLOW_INPUT_INVALID',
    ],
    [
      'missing required feedback',
      [...draftedByAgent, start(person)],
      finish('review', 1, person, { result: 'fail' }),
      'WORKFLOW_INPUT_INVALID',
    ],
    [
      'an event that requires feedback without it',
      inWait,
      { kind: 'event', at: AT, name: 'item-stopped' },
      'WORKFLOW_INPUT_INVALID',
    ],
    [
      'an event outside a wait step',
      [start(agent)],
      { kind: 'event', at: AT, name: 'items-done' },
      'WORKFLOW_POSITION_INVALID',
    ],
    [
      'a return to a step not reached',
      [],
      { kind: 'return', at: AT, step: 'draft', feedback: 'x' },
      'WORKFLOW_RETURN_NOT_ALLOWED',
    ],
    [
      'a return without required feedback',
      [start(agent)],
      { kind: 'return', at: AT, step: 'draft' },
      'WORKFLOW_INPUT_INVALID',
    ],
  ])('refuses %s', (_name, before, command, code) => {
    expect(() => decide(DEFINITION, run(...before), command)).toThrow(
      expect.objectContaining({ code }),
    );
  });

  it('lets a person do a step an agent may also do, and records who did it', () => {
    const decided = decide(DEFINITION, run(start(person)), finish('draft', 1, person));
    expect(decided.finished).toMatchObject({ actor: person, finishedBy: person });
    expect(decided.declaredEffects).toEqual([
      { source: 'transition', step: 'draft', transition: DEFINITION.steps[0]?.transitions[0] },
    ]);
  });

  it('records wait attempts without an actor and hands the event feedback over', () => {
    const stopped = decide(DEFINITION, run(...inWait), {
      kind: 'event',
      at: AT,
      name: 'item-stopped',
      feedback: ' Item b stopped. ',
    }).nextRun;
    const wait = stopped.attempts.find((record) => record.step === 'collect');
    expect(wait?.actor).toBeUndefined();
    expect(stopped.position).toEqual({ state: 'ready', step: 'draft' });
    expect(handoffOf(stopped)).toMatchObject({ kind: 'transition', feedback: 'Item b stopped.' });
  });

  it('fails closed on a run of another definition', () => {
    const other = { ...DEFINITION, title: 'Changed' };
    expect(() => decide(other, run(), start(agent))).toThrow(
      expect.objectContaining({ code: 'WORKFLOW_DEFINITION_CHANGED' }),
    );
  });
});

describe('replay', () => {
  const started = run(start(agent));
  const [first] = started.attempts;
  it.each<[string, WorkflowRun]>([
    ['a position ahead of the history', { ...run(), position: { state: 'ready', step: 'review' } }],
    [
      'an actor of a class the step does not allow',
      {
        ...run(...draftedByAgent, start(person)),
        attempts: run(...draftedByAgent, start(person)).attempts.map((record) =>
          record.step === 'review' ? { ...record, actor: agent } : record,
        ),
      },
    ],
    [
      'a work attempt without an actor',
      { ...started, attempts: [{ ...first!, actor: undefined }] },
    ],
    [
      'a finish by another class',
      {
        ...run(...draftedByAgent),
        attempts: run(...draftedByAgent).attempts.map((record) => ({
          ...record,
          finishedBy: person,
        })),
      },
    ],
    [
      'a wait attempt with an actor',
      {
        ...run(...inWait),
        attempts: run(...inWait).attempts.map((record) =>
          record.step === 'collect' ? { ...record, actor: agent } : record,
        ),
      },
    ],
    [
      'a transition into a wait step that was not entered',
      {
        ...run(...inWait),
        position: { state: 'ready', step: 'collect' },
        attempts: run(...inWait).attempts.filter((record) => record.step !== 'collect'),
      },
    ],
    [
      'two records with one sequence',
      {
        ...run(...inWait),
        attempts: run(...inWait).attempts.map((record) =>
          record.step === 'collect' ? { ...record, sequence: 1 } : record,
        ),
      },
    ],
    [
      'two attempts with one number',
      {
        ...run(
          start(agent),
          finish('draft', 1, agent),
          start(person),
          finish('review', 1, person, { result: 'fail', feedback: 'No.' }),
          start(agent),
        ),
        attempts: run(
          start(agent),
          finish('draft', 1, agent),
          start(person),
          finish('review', 1, person, { result: 'fail', feedback: 'No.' }),
          start(agent),
        ).attempts.map((record) =>
          record.step === 'draft' && record.sequence === 3 ? { ...record, attempt: 1 } : record,
        ),
        position: { state: 'active', step: 'draft', attempt: 1 },
      },
    ],
  ])('rejects %s', (_name, value) => {
    expect(isPositionJustified(value, DEFINITION)).toBe(false);
    expect(() => decide(DEFINITION, value, start(agent))).toThrow(
      expect.objectContaining({ code: 'WORKFLOW_STATE_CORRUPT' }),
    );
  });
});

describe('a repeated finish (F16)', () => {
  const finishOnce = [start(agent), finish('draft', 1, agent, { requestDigest: 'd1' })];

  it('returns the recorded result without a change for the same digest and actor', () => {
    const before = run(...finishOnce);
    const retry = decide(DEFINITION, before, finish('draft', 1, agent, { requestDigest: 'd1' }));
    expect(retry.replayed).toBe(true);
    expect(retry.nextRun).toBe(before);
    expect(retry.finished?.outcome).toMatchObject({ transition: 'drafted' });
    expect(retry.intent).toEqual({ kind: 'ready', step: 'review', continuation: 'auto' });
  });

  it('still recognizes the retry after the finish entered a wait step', () => {
    const before = run(
      ...draftedByAgent,
      start(person),
      finish('review', 1, person, { result: 'pass', requestDigest: 'r1' }),
    );
    expect(
      decide(
        DEFINITION,
        before,
        finish('review', 1, person, { result: 'pass', requestDigest: 'r1' }),
      ).replayed,
    ).toBe(true);
  });

  it.each<[string, WorkflowCommand]>([
    ['another digest', finish('draft', 1, agent, { requestDigest: 'd2' })],
    ['no digest', finish('draft', 1, agent)],
    [
      'another actor',
      finish(
        'draft',
        1,
        { ...agent, details: { provider: 'p', sessionId: 's2' } },
        { requestDigest: 'd1' },
      ),
    ],
  ])('refuses %s with WORKFLOW_ATTEMPT_MISMATCH', (_name, command) => {
    expect(() => decide(DEFINITION, run(...finishOnce), command)).toThrow(
      expect.objectContaining({ code: 'WORKFLOW_ATTEMPT_MISMATCH' }),
    );
  });

  const review = finish('review', 1, person, { result: 'pass', requestDigest: 'r1' });
  const reviewed = [...draftedByAgent, start(person), review];
  const back: WorkflowCommand = { kind: 'return', at: AT, step: 'draft', feedback: 'Again.' };

  it.each<[string, WorkflowCommand[], WorkflowCommand]>([
    [
      'a later finish, with nothing active',
      [
        ...finishOnce,
        start(person),
        finish('review', 1, person, { result: 'fail', feedback: 'No.' }),
      ],
      finish('draft', 1, agent, { requestDigest: 'd1' }),
    ],
    [
      'a later start',
      [...finishOnce, start(person)],
      finish('draft', 1, agent, { requestDigest: 'd1' }),
    ],
    ['an owner return from the wait step it entered', [...reviewed, back], review],
    [
      'an owner return from a ready step',
      [...finishOnce, back],
      finish('draft', 1, agent, { requestDigest: 'd1' }),
    ],
  ])('is a stale finish, not a retry, after %s', (_name, before, command) => {
    expect(() => decide(DEFINITION, run(...before), command)).toThrow(
      expect.objectContaining({ code: 'WORKFLOW_ATTEMPT_MISMATCH' }),
    );
  });
});

describe('two runs of one definition', () => {
  it('keep separate histories under the same pin', () => {
    const first = run(start(agent), finish('draft', 1, agent));
    const second = run(start(person));
    expect(first.workflow).toEqual(second.workflow);
    expect(first.position).toEqual({ state: 'ready', step: 'review' });
    expect(second.position).toEqual({ state: 'active', step: 'draft', attempt: 1 });
    expect(decide(DEFINITION, second, finish('draft', 1, person)).nextRun.attempts).toHaveLength(1);
    expect(first.attempts[0]?.actor).toEqual(agent);
  });
});
