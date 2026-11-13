import { beforeAll, describe, expect, it } from 'vitest';

import type { ExecutionCatalogue } from '../definitions/catalogue';
import type { WorkflowActor } from '../state/model';
import { finishStep, type FinishStepInput } from './finish';
import { inspectExecution } from './inspect';
import type { PostActionResult, StepFinishedEvent } from './post-actions';
import {
  SPEC,
  agent,
  claude,
  memoryDependencies,
  owner,
  positionOf,
  runToBreakdown,
  seedExecutionCatalogue,
  specification,
  startSpecification,
  work,
} from './operations.test-support';

let catalogue: ExecutionCatalogue;

beforeAll(async () => {
  catalogue = await seedExecutionCatalogue();
});

describe('continuation after a finished step', () => {
  it('continues the same Session with the archetype model of its provider', async () => {
    const dependencies = memoryDependencies(catalogue);
    const result = await work(dependencies, specification);

    expect(result.continuation).toEqual({
      kind: 'continue',
      step: 'specification',
      launch: {
        archetype: 'spec-writer',
        provider: 'claude',
        model: 'claude-opus-5-5',
        session: { mode: 'reuse', sessionId: 'session-a' },
      },
    });
    expect(await positionOf(dependencies, specification)).toEqual({
      state: 'ready',
      step: 'specification',
    });
  });

  it('stops for the owner when the continued Session has no model for its provider', async () => {
    const dependencies = memoryDependencies(catalogue);
    const result = await work(dependencies, specification, {}, agent('antigravity', 'session-g'));

    expect(result.continuation).toMatchObject({
      kind: 'attention',
      step: 'specification',
      reason: 'model-missing',
      archetype: 'spec-writer',
      provider: 'antigravity',
    });
    expect((await inspectExecution(dependencies, SPEC)).attention).toHaveLength(1);
  });

  it('stops for the owner when the preferred provider of a fresh Session has no model', async () => {
    const dependencies = memoryDependencies(catalogue);
    await work(dependencies, specification);
    await work(dependencies, specification);
    await work(dependencies, specification);
    const result = await work(dependencies, specification, { tasks: [] }); // breakdown -> review by codex

    expect(result.continuation).toMatchObject({
      kind: 'attention',
      step: 'breakdown-review',
      reason: 'model-missing',
      archetype: 'reviewer',
      provider: 'codex',
    });
  });

  it('shows no attention once the step is started, whoever starts it', async () => {
    const dependencies = memoryDependencies(catalogue);
    await work(dependencies, specification, {}, agent('antigravity', 'session-g'));
    await startSpecification(dependencies, agent('claude', 'session-b', 'claude-opus-5-5'));

    expect((await inspectExecution(dependencies, SPEC)).attention).toEqual([]);
  });

  it('hands the review feedback to the next attempt of the reviewed step', async () => {
    const dependencies = memoryDependencies(catalogue);
    for (let index = 0; index < 3; index += 1) {
      await work(dependencies, specification);
    }

    await work(dependencies, specification, { tasks: [] });
    await expect(work(dependencies, specification, { result: 'fail' })).rejects.toMatchObject({
      code: 'WORKFLOW_INPUT_INVALID',
    });
    await finishStep(dependencies, {
      subject: specification,
      step: 'breakdown-review',
      attempt: 1,
      input: { result: 'fail', feedback: 'Split the UI task.' },
      actor: claude,
    });
    const started = await startSpecification(dependencies);

    expect(started).toMatchObject({
      context: {
        step: { id: 'breakdown' },
        attempt: 2,
        handoff: {
          kind: 'transition',
          from: { step: 'breakdown-review', attempt: 1 },
          result: 'fail',
          feedback: 'Split the UI task.',
        },
      },
    });
  });
});

describe('the executor of a finished step', () => {
  const finishRequirements = (
    dependencies: ReturnType<typeof memoryDependencies>,
    executor: WorkflowActor | undefined,
  ) =>
    finishStep(dependencies, {
      subject: specification,
      step: 'requirements',
      attempt: 1,
      input: {},
      ...(executor ? { actor: executor } : {}),
    } as FinishStepInput);

  it.each<[string, WorkflowActor | undefined]>([
    ['the owner', owner],
    ['no actor', undefined],
    ['another Session of the provider', agent('claude', 'session-b', 'claude-opus-5-5')],
    ['the same Session id of another provider', agent('codex', 'session-a')],
  ])('refuses %s finishing the attempt of an agent Session', async (_name, executor) => {
    const dependencies = memoryDependencies(catalogue);
    await startSpecification(dependencies);
    const applied = dependencies.store.applied.length;

    await expect(finishRequirements(dependencies, executor)).rejects.toMatchObject({
      code: 'WORKFLOW_EXECUTOR_NOT_ALLOWED',
    });
    expect(dependencies.store.applied).toHaveLength(applied);
    expect(await positionOf(dependencies, specification)).toMatchObject({ state: 'active' });
  });

  it('lets the Session that started the attempt finish it', async () => {
    const dependencies = memoryDependencies(catalogue);
    await startSpecification(dependencies);

    await expect(finishRequirements(dependencies, claude)).resolves.toMatchObject({
      position: { state: 'ready', step: 'specification' },
    });
  });
});

describe('fail closed', () => {
  it('never completes an attempt other than the active one', async () => {
    const dependencies = memoryDependencies(catalogue);
    await startSpecification(dependencies);

    await expect(
      finishStep(dependencies, {
        subject: specification,
        step: 'requirements',
        attempt: 2,
        input: {},
        actor: claude,
      }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_ATTEMPT_MISMATCH' });
  });

  it('refuses to interpret a run with a changed definition', async () => {
    const dependencies = memoryDependencies(catalogue);
    await startSpecification(dependencies);
    const changed = memoryDependencies({
      ...catalogue,
      workflow: (id) => {
        const definition = catalogue.workflow(id);

        return definition ? { ...definition, title: 'Edited' } : undefined;
      },
    });
    Object.assign(changed, { store: dependencies.store });

    await expect(
      finishStep(changed, {
        subject: specification,
        step: 'requirements',
        attempt: 1,
        input: {},
        actor: claude,
      }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_DEFINITION_CHANGED' });
  });

  it('refuses Tasks from a step that does not produce them', async () => {
    const dependencies = memoryDependencies(catalogue);

    await expect(work(dependencies, specification, { tasks: [] })).rejects.toMatchObject({
      code: 'WORKFLOW_INPUT_INVALID',
    });
  });

  it.each<[string, FinishStepInput['input']]>([
    ['an empty artifact', { artifacts: [''] }],
    ['over-long feedback', { feedback: 'x'.repeat(16385) }],
  ])('rejects %s before anything is stored', async (_name, input) => {
    const dependencies = memoryDependencies(catalogue);
    await startSpecification(dependencies);
    const applied = dependencies.store.applied.length;

    await expect(
      finishStep(dependencies, {
        subject: specification,
        step: 'requirements',
        attempt: 1,
        input,
        actor: claude,
      }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_INPUT_INVALID' });
    expect(dependencies.store.applied).toHaveLength(applied);
    expect(await positionOf(dependencies, specification)).toMatchObject({ state: 'active' });
  });

  it('rejects a Task proposal over the stored limits before anything is stored', async () => {
    const dependencies = memoryDependencies(catalogue);
    await runToBreakdown(dependencies);
    const applied = dependencies.store.applied.length;

    await expect(
      finishStep(dependencies, {
        subject: specification,
        step: 'breakdown',
        attempt: 1,
        input: { tasks: [{ id: 'api', title: 'x'.repeat(201), type: 'implementation' }] },
        actor: claude,
      }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_INPUT_INVALID' });
    expect(dependencies.store.applied).toHaveLength(applied);
  });
});

describe('a step done by hand', () => {
  it('reports session-unavailable when the next step would reuse the Session of a person (D10)', async () => {
    const dependencies = memoryDependencies(catalogue);
    const result = await work(dependencies, specification, {}, owner);

    expect(result.continuation).toEqual({
      kind: 'attention',
      step: 'specification',
      reason: 'session-unavailable',
      archetype: 'spec-writer',
    });
    const inspection = await inspectExecution(dependencies, SPEC);
    expect(inspection.attention).toEqual([
      expect.objectContaining({ step: 'specification', reason: 'session-unavailable' }),
    ]);
    expect(inspection.specification?.record.run.attempts[0]).toMatchObject({
      actor: owner,
      finishedBy: owner,
    });
  });

  it('ships acceptance as a human-only gate, and an agent never takes over a person attempt', async () => {
    const dependencies = memoryDependencies(catalogue);
    const human = (step: string) =>
      catalogue
        .workflow('specification-standard')
        ?.steps.find((candidate) => candidate.id === step);
    expect(human('acceptance')).toMatchObject({ executors: ['human'] });
    expect(human('breakdown')).toMatchObject({ executors: ['agent', 'human'] });
    await startSpecification(dependencies, owner);

    await expect(work(dependencies, specification, {}, claude)).rejects.toMatchObject({
      code: 'WORKFLOW_EXECUTOR_NOT_ALLOWED',
    });
  });
});

describe('a repeated finish (F16)', () => {
  const finishRequirements = (
    dependencies: ReturnType<typeof memoryDependencies>,
    feedback?: string,
  ) =>
    finishStep(dependencies, {
      subject: specification,
      step: 'requirements',
      attempt: 1,
      input: feedback !== undefined ? { feedback } : {},
      actor: claude,
    });

  it('returns the recorded result without writing again', async () => {
    const dependencies = memoryDependencies(catalogue);
    await startSpecification(dependencies);
    const first = await finishRequirements(dependencies, 'Agreed.');
    const applied = dependencies.store.applied.length;

    const again = await finishRequirements(dependencies, 'Agreed.');
    expect(again).toEqual({ ...first, replayed: true });
    expect(dependencies.store.applied).toHaveLength(applied);
  });

  it('runs the post actions after the change is published, again for a repeated finish', async () => {
    const events: StepFinishedEvent[] = [];
    const result: PostActionResult = { action: 'commit-execution-state', status: 'completed' };
    const dependencies = {
      ...memoryDependencies(catalogue),
      postActions: {
        afterStepFinished: (event: StepFinishedEvent) => {
          events.push(event);

          return Promise.resolve([result]);
        },
      },
    };
    await startSpecification(dependencies);
    const first = await finishRequirements(dependencies, 'Agreed.');
    // The change names the step for its commit.
    expect(dependencies.store.applied.at(-1)?.summary).toBe('finish step requirements (attempt 1)');
    expect(first.postActions).toEqual([result]);

    const again = await finishRequirements(dependencies, 'Agreed.');
    expect(again.postActions).toEqual([result]);
    expect(events.map((event) => [event.step, event.attempt, event.replayed])).toEqual([
      ['requirements', 1, false],
      ['requirements', 1, true],
    ]);
  });

  it('refuses another finish of the same attempt', async () => {
    const dependencies = memoryDependencies(catalogue);
    await startSpecification(dependencies);
    await finishRequirements(dependencies, 'Agreed.');

    await expect(finishRequirements(dependencies, 'Something else.')).rejects.toMatchObject({
      code: 'WORKFLOW_ATTEMPT_MISMATCH',
    });
  });

  it('reports a stale retry as an attempt mismatch while another Session works on the run', async () => {
    const dependencies = memoryDependencies(catalogue);
    await startSpecification(dependencies);
    await finishRequirements(dependencies, 'Agreed.');
    await startSpecification(dependencies, agent('codex', 'session-other'));

    await expect(finishRequirements(dependencies, 'Agreed.')).rejects.toMatchObject({
      code: 'WORKFLOW_ATTEMPT_MISMATCH',
    });
  });
});
