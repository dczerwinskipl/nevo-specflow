import { beforeAll, describe, expect, it } from 'vitest';

import { createDefaultDefinitionRegistry } from '../../specs/definitions/kinds';
import { loadDefinitions } from '../../specs/definitions/loader';
import { MemoryDefinitionSource } from '../../specs/definitions/test-support';
import { resolveExecutionCatalogue, type ExecutionCatalogue } from '../definitions/catalogue';
import type { WorkflowSubject } from '../state/model';
import { finishStep } from './finish';
import { inspectExecution } from './inspect';
import {
  agent,
  memoryDependencies,
  owner,
  seedDefinitionFiles,
  seedExecutionCatalogue,
} from './operations.test-support';
import { returnToStep } from './return';
import { startSpecificationExecution, startTaskExecution } from './start';

const SPEC = 'spec-1';
const specification: WorkflowSubject = { kind: 'specification', specId: SPEC };
const task = (taskId: string): WorkflowSubject => ({ kind: 'task', specId: SPEC, taskId });

let catalogue: ExecutionCatalogue;

beforeAll(async () => {
  catalogue = await seedExecutionCatalogue();
});

type Dependencies = ReturnType<typeof memoryDependencies>;

async function activeStep(dependencies: Dependencies, subject: WorkflowSubject) {
  const inspection = await inspectExecution(dependencies, SPEC);
  const run =
    subject.kind === 'specification'
      ? inspection.specification?.record.run
      : inspection.tasks.find((entry) => entry.record.taskId === subject.taskId)?.record.run;

  return run?.position;
}

/** Start and finish the subject's next step in one go (what one agent turn does). */
async function work(
  dependencies: Dependencies,
  subject: WorkflowSubject,
  input: Parameters<typeof finishStep>[1]['input'] = {},
  executor = agent('claude', 'session-a', 'claude-opus-5-5'),
) {
  const started =
    subject.kind === 'specification'
      ? await startSpecificationExecution(dependencies, {
          specId: SPEC,
          archetype: 'feature',
          executor,
        })
      : await startTaskExecution(dependencies, { specId: SPEC, taskId: subject.taskId, executor });
  if (started.kind === 'terminal') {
    throw new Error('Nothing to start.');
  }

  return finishStep(dependencies, {
    subject,
    step: started.context.step.id,
    attempt: started.context.attempt,
    input,
    executor,
  });
}

/** Runs the Specification up to the wait step with two Tasks: `api`, then `screen` depending on it. */
async function specificationWithTasks(dependencies: Dependencies) {
  await work(dependencies, specification); // requirements
  await work(dependencies, specification); // specification
  await work(dependencies, specification); // solution
  await work(dependencies, specification); // breakdown
  await work(dependencies, specification, { result: 'pass' }, agent('codex', 'session-r', 'x'));

  return work(dependencies, specification, {
    tasks: [
      { id: 'api', title: 'API', type: 'implementation' },
      { id: 'screen', title: 'Screen', type: 'ui-implementation', dependsOn: ['api'] },
    ],
  });
}

describe('start Specification execution', () => {
  it('pins the archetype workflow and starts the interactive requirements step', async () => {
    const dependencies = memoryDependencies(catalogue);
    const started = await startSpecificationExecution(dependencies, {
      specId: SPEC,
      archetype: 'feature',
    });

    expect(started.kind).toBe('started');
    if (started.kind === 'terminal') {
      return;
    }

    expect(started.context.step).toMatchObject({
      id: 'requirements',
      executor: 'agent',
      interaction: 'interactive',
    });
    expect(started.context.archetype).toMatchObject({
      id: 'spec-writer',
      profile: 'nevo-agents:spec-writer',
    });
    const inspection = await inspectExecution(dependencies, SPEC);
    expect(inspection.specification?.record).toMatchObject({
      archetype: 'feature',
      taskTypes: ['*'],
      run: { workflow: { id: 'specification-standard', version: 1 } },
    });
  });

  it('resumes the active attempt idempotently', async () => {
    const dependencies = memoryDependencies(catalogue);
    await startSpecificationExecution(dependencies, { specId: SPEC, archetype: 'feature' });
    const again = await startSpecificationExecution(dependencies, {
      specId: SPEC,
      archetype: 'feature',
    });

    expect(again).toMatchObject({ kind: 'resumed', context: { attempt: 1 } });
    expect(dependencies.store.applied).toHaveLength(1);
  });

  it('refuses an archetype without an execution binding', async () => {
    const dependencies = memoryDependencies(catalogue);

    await expect(
      startSpecificationExecution(dependencies, { specId: SPEC, archetype: 'unknown' }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_NOT_CONFIGURED' });
  });
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
    expect(await activeStep(dependencies, specification)).toEqual({
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
    const result = await work(dependencies, specification); // breakdown -> review by codex

    expect(result.continuation).toMatchObject({
      kind: 'attention',
      step: 'breakdown-review',
      reason: 'model-missing',
      archetype: 'reviewer',
      provider: 'codex',
    });
  });

  it('removes the attention item when the step is started, whoever starts it', async () => {
    const dependencies = memoryDependencies(catalogue);
    await work(dependencies, specification, {}, agent('antigravity', 'session-g'));
    await startSpecificationExecution(dependencies, {
      specId: SPEC,
      archetype: 'feature',
      executor: agent('claude', 'session-b', 'claude-opus-5-5'),
    });

    expect((await inspectExecution(dependencies, SPEC)).attention).toEqual([]);
  });

  it('hands the review feedback to the next attempt of the reviewed step', async () => {
    const dependencies = memoryDependencies(catalogue);
    for (let index = 0; index < 4; index += 1) {
      await work(dependencies, specification);
    }

    await expect(work(dependencies, specification, { result: 'fail' })).rejects.toMatchObject({
      code: 'WORKFLOW_INPUT_INVALID',
    });
    await finishStep(dependencies, {
      subject: specification,
      step: 'breakdown-review',
      attempt: 1,
      input: { result: 'fail', feedback: 'Split the UI task.' },
    });
    const started = await startSpecificationExecution(dependencies, {
      specId: SPEC,
      archetype: 'feature',
    });

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

describe('Tasks of a Specification', () => {
  it('creates Tasks with their own types and workflows and waits for them', async () => {
    const dependencies = memoryDependencies(catalogue);
    const result = await specificationWithTasks(dependencies);

    expect(result.createdTasks).toEqual(['api', 'screen']);
    expect(result.continuation).toEqual({ kind: 'none', reason: 'waiting-for-tasks' });
    expect(await activeStep(dependencies, specification)).toEqual({
      state: 'active',
      step: 'implementation',
      attempt: 1,
    });
    const tasks = (await inspectExecution(dependencies, SPEC)).tasks;
    expect(tasks.map((entry) => [entry.record.taskId, entry.record.run.workflow.id])).toEqual([
      ['api', 'task-standard'],
      ['screen', 'task-ui'],
    ]);
    expect(tasks.map((entry) => entry.readiness.kind)).toEqual(['ready', 'dependencies']);
  });

  it('gives the planner the allowed task types', async () => {
    const dependencies = memoryDependencies(catalogue);
    for (let index = 0; index < 4; index += 1) {
      await work(dependencies, specification);
    }

    await work(dependencies, specification, { result: 'pass' });
    const started = await startSpecificationExecution(dependencies, {
      specId: SPEC,
      archetype: 'feature',
    });

    expect(started).toMatchObject({ context: { step: { id: 'create-tasks', produces: 'tasks' } } });
    if (started.kind !== 'terminal') {
      expect(started.context.taskTypes?.map((type) => type.id)).toEqual([
        'implementation',
        'ui-implementation',
      ]);
    }
  });

  it('refuses to start a Task before its dependencies completed', async () => {
    const dependencies = memoryDependencies(catalogue);
    await specificationWithTasks(dependencies);

    await expect(
      startTaskExecution(dependencies, { specId: SPEC, taskId: 'screen' }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_DEPENDENCY_UNSATISFIED' });
  });

  it('completes the wait step when the last Task ends and hands over to the owner', async () => {
    const dependencies = memoryDependencies(catalogue);
    await specificationWithTasks(dependencies);
    await work(dependencies, task('api'));
    const reviewed = await work(dependencies, task('api'), { result: 'pass' });
    expect(reviewed.position).toEqual({ state: 'terminal', outcome: 'completed' });
    expect(reviewed.specification).toBeUndefined();

    await work(dependencies, task('screen'));
    const last = await work(dependencies, task('screen'), { result: 'pass' });

    expect(last.specification).toEqual({
      kind: 'attention',
      step: 'acceptance',
      reason: 'human-step',
    });
    expect(await activeStep(dependencies, specification)).toEqual({
      state: 'ready',
      step: 'acceptance',
    });
  });

  it('never lets an agent do the human acceptance', async () => {
    const dependencies = memoryDependencies(catalogue);
    await specificationWithTasks(dependencies);
    for (const id of ['api', 'screen']) {
      await work(dependencies, task(id));
      await work(dependencies, task(id), { result: 'pass' });
    }

    await expect(work(dependencies, specification)).rejects.toMatchObject({
      code: 'WORKFLOW_EXECUTOR_NOT_ALLOWED',
    });
    const accepted = await work(dependencies, specification, {}, owner);
    expect(accepted.position).toEqual({ state: 'terminal', outcome: 'completed' });
  });

  it('rejects a task type the Specification archetype does not allow', async () => {
    const dependencies = memoryDependencies(catalogue);
    const start = (executor = agent('claude', 'a', 'm')) =>
      startSpecificationExecution(dependencies, {
        specId: SPEC,
        archetype: 'architecture',
        executor,
      });
    for (let index = 0; index < 5; index += 1) {
      const started = await start();
      if (started.kind === 'terminal') {
        throw new Error('Unexpected end.');
      }

      await finishStep(dependencies, {
        subject: specification,
        step: started.context.step.id,
        attempt: started.context.attempt,
        input: started.context.step.id === 'breakdown-review' ? { result: 'pass' } : {},
      });
    }

    await start();
    await expect(
      finishStep(dependencies, {
        subject: specification,
        step: 'create-tasks',
        attempt: 1,
        input: { tasks: [{ id: 'screen', title: 'Screen', type: 'ui-implementation' }] },
      }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_INPUT_INVALID' });
  });
});

describe('ready Tasks', () => {
  it('never starts a Task or records attention for it just because it is ready', async () => {
    const dependencies = memoryDependencies(catalogue);
    await specificationWithTasks(dependencies);
    await work(dependencies, task('api'));
    await work(dependencies, task('api'), { result: 'pass' });

    const inspection = await inspectExecution(dependencies, SPEC);
    expect(inspection.attention.map((item) => item.subject.kind)).not.toContain('task');
    expect(
      inspection.tasks.map((entry) => [entry.record.run.position.state, entry.readiness.kind]),
    ).toEqual([
      ['terminal', 'ready'],
      ['not-started', 'ready'],
    ]);
  });
});

describe('return to an earlier step', () => {
  it('blocks Tasks that have not started and resumes them after the new breakdown', async () => {
    const dependencies = memoryDependencies(catalogue);
    await specificationWithTasks(dependencies);
    await startTaskExecution(dependencies, { specId: SPEC, taskId: 'api' });

    const returned = await returnToStep(dependencies, {
      subject: specification,
      step: 'breakdown',
      feedback: 'Add an audit Task.',
    });

    expect(returned.continuation).toMatchObject({ kind: 'attention', reason: 'owner-action' });
    const blocked = (await inspectExecution(dependencies, SPEC)).tasks;
    expect(blocked.map((entry) => [entry.record.taskId, entry.readiness.kind])).toEqual([
      ['api', 'ready'],
      ['screen', 'blocked'],
    ]);
    await expect(
      startTaskExecution(dependencies, { specId: SPEC, taskId: 'screen' }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_TASK_BLOCKED' });
    await expect(
      returnToStep(dependencies, { subject: task('screen'), step: 'implement', feedback: 'x' }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_TASK_BLOCKED' });

    const started = await startSpecificationExecution(dependencies, {
      specId: SPEC,
      archetype: 'feature',
    });
    expect(started).toMatchObject({
      context: {
        step: { id: 'breakdown' },
        handoff: { kind: 'return', feedback: 'Add an audit Task.' },
      },
    });
    await finishStep(dependencies, {
      subject: specification,
      step: 'breakdown',
      attempt: 2,
      input: {},
    });
    await work(dependencies, specification, { result: 'pass' });
    const created = await work(dependencies, specification, {
      tasks: [{ id: 'audit', title: 'Audit', type: 'implementation', dependsOn: ['api'] }],
    });

    expect(created.createdTasks).toEqual(['audit']);
    const resumed = (await inspectExecution(dependencies, SPEC)).tasks;
    expect(resumed.map((entry) => [entry.record.taskId, entry.readiness.kind])).toEqual([
      ['api', 'ready'],
      ['audit', 'dependencies'],
      ['screen', 'dependencies'],
    ]);
  });

  it('refuses an undeclared return and a return of a finished run', async () => {
    const dependencies = memoryDependencies(catalogue);
    await work(dependencies, specification);

    await expect(
      returnToStep(dependencies, { subject: specification, step: 'acceptance', feedback: 'x' }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_RETURN_NOT_ALLOWED' });
    await expect(
      returnToStep(dependencies, { subject: specification, step: 'requirements' }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_INPUT_INVALID' });
  });
});

describe('fail closed', () => {
  it('never completes an attempt other than the active one', async () => {
    const dependencies = memoryDependencies(catalogue);
    await startSpecificationExecution(dependencies, { specId: SPEC, archetype: 'feature' });

    await expect(
      finishStep(dependencies, {
        subject: specification,
        step: 'requirements',
        attempt: 2,
        input: {},
      }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_ATTEMPT_MISMATCH' });
  });

  it('refuses to interpret a run with a changed definition', async () => {
    const dependencies = memoryDependencies(catalogue);
    await startSpecificationExecution(dependencies, { specId: SPEC, archetype: 'feature' });
    const changed = memoryDependencies({
      ...catalogue,
      workflow: (id) => {
        const definition = catalogue.workflow(id);

        return definition ? { ...definition, title: 'Edited' } : undefined;
      },
    });
    Object.assign(changed, { store: dependencies.store });

    await expect(
      finishStep(changed, { subject: specification, step: 'requirements', attempt: 1, input: {} }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_DEFINITION_CHANGED' });
  });

  it('refuses Tasks from a step that does not produce them', async () => {
    const dependencies = memoryDependencies(catalogue);

    await expect(work(dependencies, specification, { tasks: [] })).rejects.toMatchObject({
      code: 'WORKFLOW_INPUT_INVALID',
    });
  });

  it.each<[string, Parameters<typeof finishStep>[1]['input']]>([
    ['an empty artifact', { artifacts: [''] }],
    ['over-long feedback', { feedback: 'x'.repeat(16385) }],
  ])('rejects %s before anything is stored', async (_name, input) => {
    const dependencies = memoryDependencies(catalogue);
    await startSpecificationExecution(dependencies, { specId: SPEC, archetype: 'feature' });
    const applied = dependencies.store.applied.length;

    await expect(
      finishStep(dependencies, { subject: specification, step: 'requirements', attempt: 1, input }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_INPUT_INVALID' });
    expect(dependencies.store.applied).toHaveLength(applied);
    expect(await activeStep(dependencies, specification)).toMatchObject({ state: 'active' });
  });

  it('rejects a Task proposal over the stored limits before anything is stored', async () => {
    const dependencies = memoryDependencies(catalogue);
    await runToCreateTasks(dependencies);
    const applied = dependencies.store.applied.length;

    await expect(
      finishStep(dependencies, {
        subject: specification,
        step: 'create-tasks',
        attempt: 1,
        input: { tasks: [{ id: 'api', title: 'x'.repeat(201), type: 'implementation' }] },
      }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_INPUT_INVALID' });
    expect(dependencies.store.applied).toHaveLength(applied);
  });
});

/** Runs the Specification until `create-tasks` is active. */
async function runToCreateTasks(dependencies: Dependencies) {
  for (let index = 0; index < 4; index += 1) {
    await work(dependencies, specification);
  }

  await work(dependencies, specification, { result: 'pass' });
  const started = await startSpecificationExecution(dependencies, {
    specId: SPEC,
    archetype: 'feature',
  });
  if (started.kind === 'terminal') {
    throw new Error('Unexpected end.');
  }

  return started.context;
}

describe('waiting for Tasks', () => {
  it('completes the wait step at once when the breakdown creates no Task', async () => {
    const dependencies = memoryDependencies(catalogue);
    await runToCreateTasks(dependencies);
    const result = await finishStep(dependencies, {
      subject: specification,
      step: 'create-tasks',
      attempt: 1,
      input: { tasks: [] },
    });

    expect(result.continuation).toEqual({
      kind: 'attention',
      step: 'acceptance',
      reason: 'human-step',
    });
    expect(await activeStep(dependencies, specification)).toEqual({
      state: 'ready',
      step: 'acceptance',
    });
  });

  it('tells the owner when the open Tasks can no longer progress, and clears it on a return', async () => {
    // A Task workflow whose review can also abandon the Task.
    const withAbandon: ExecutionCatalogue = {
      ...catalogue,
      workflow: (id) => {
        const definition = catalogue.workflow(id);
        if (id !== 'task-standard' || !definition) {
          return definition;
        }

        return {
          ...definition,
          steps: definition.steps.map((step) =>
            step.id === 'review'
              ? {
                  ...step,
                  transitions: [
                    ...step.transitions,
                    {
                      id: 'dropped',
                      result: 'drop',
                      target: { kind: 'terminal', outcome: 'abandoned' },
                      continuation: 'owner-action',
                      session: 'fresh',
                      feedback: 'optional',
                      effects: [],
                    },
                  ],
                }
              : step,
          ),
        };
      },
    };
    const dependencies = memoryDependencies(withAbandon);
    await specificationWithTasks(dependencies);
    await work(dependencies, task('api'));
    const dropped = await work(dependencies, task('api'), { result: 'drop' });

    expect(dropped.position).toEqual({ state: 'terminal', outcome: 'abandoned' });
    expect(dropped.specification).toEqual({
      kind: 'attention',
      step: 'implementation',
      reason: 'tasks-stuck',
    });
    const inspection = await inspectExecution(dependencies, SPEC);
    expect(inspection.tasks.map((entry) => entry.readiness)).toEqual([
      { kind: 'ready' },
      { kind: 'dependencies', waitingFor: ['api'] },
    ]);
    expect(inspection.attention).toMatchObject([{ subject: specification, reason: 'tasks-stuck' }]);
    await expect(
      startTaskExecution(dependencies, { specId: SPEC, taskId: 'screen' }),
    ).rejects.toMatchObject({
      code: 'WORKFLOW_DEPENDENCY_UNSATISFIED',
      message: expect.stringContaining('can no longer complete') as unknown,
    });
    await expect(
      startSpecificationExecution(dependencies, { specId: SPEC, archetype: 'feature' }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_POSITION_INVALID' });
    expect((await inspectExecution(dependencies, SPEC)).attention).toMatchObject([
      { subject: specification, reason: 'tasks-stuck' },
    ]);

    await returnToStep(dependencies, {
      subject: specification,
      step: 'breakdown',
      feedback: 'Replace the API Task.',
    });
    expect((await inspectExecution(dependencies, SPEC)).attention).toMatchObject([
      { subject: specification, reason: 'owner-action' },
    ]);
  });

  it('lets a Task finish succeed after the Specification workflow was edited', async () => {
    const dependencies = memoryDependencies(catalogue);
    await specificationWithTasks(dependencies);
    const edited = memoryDependencies({
      ...catalogue,
      workflow: (id) => {
        const definition = catalogue.workflow(id);

        return definition && id === 'specification-standard'
          ? { ...definition, title: 'Edited' }
          : definition;
      },
    });
    Object.assign(edited, { store: dependencies.store });

    await work(edited, task('api'));
    const reviewed = await work(edited, task('api'), { result: 'pass' });

    expect(reviewed.position).toEqual({ state: 'terminal', outcome: 'completed' });
    expect(reviewed.specification).toBeUndefined();
    await expect(
      startSpecificationExecution(edited, { specId: SPEC, archetype: 'feature' }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_DEFINITION_CHANGED' });
  });

  it('leaves a Specification that works on a new breakdown alone when a running Task ends', async () => {
    const dependencies = memoryDependencies(catalogue);
    await specificationWithTasks(dependencies);
    await work(dependencies, task('api'));
    await returnToStep(dependencies, { subject: specification, step: 'breakdown', feedback: 'x' });
    await startSpecificationExecution(dependencies, { specId: SPEC, archetype: 'feature' });
    const edited = memoryDependencies({
      ...catalogue,
      workflow: (id) => {
        const definition = catalogue.workflow(id);

        return definition && id === 'specification-standard'
          ? { ...definition, title: 'Edited' }
          : definition;
      },
    });
    Object.assign(edited, { store: dependencies.store });

    const reviewed = await work(edited, task('api'), { result: 'pass' });

    expect(reviewed.position).toEqual({ state: 'terminal', outcome: 'completed' });
    expect(reviewed.specification).toBeUndefined();
    const attention = (await inspectExecution(dependencies, SPEC)).attention;
    expect(attention.filter((item) => item.subject.kind === 'specification')).toEqual([]);
  });

  it('shows the planner the Tasks that already exist', async () => {
    const dependencies = memoryDependencies(catalogue);
    await specificationWithTasks(dependencies);
    await returnToStep(dependencies, {
      subject: specification,
      step: 'breakdown',
      feedback: 'Add an audit Task.',
    });
    await work(dependencies, specification); // breakdown
    await work(dependencies, specification, { result: 'pass' });
    const started = await startSpecificationExecution(dependencies, {
      specId: SPEC,
      archetype: 'feature',
    });

    expect(started).toMatchObject({
      context: {
        step: { id: 'create-tasks' },
        existingTasks: [
          {
            id: 'api',
            title: 'API',
            type: 'implementation',
            state: 'not-started',
            blocked: true,
            readiness: 'blocked',
          },
          {
            id: 'screen',
            title: 'Screen',
            type: 'ui-implementation',
            state: 'not-started',
            blocked: true,
            readiness: 'blocked',
          },
        ],
      },
    });
  });
});

describe('definition problems never cascade', () => {
  async function loadEdited(edit: (files: Record<string, string>) => void) {
    const files = await seedDefinitionFiles();
    edit(files);

    return loadDefinitions(new MemoryDefinitionSource(files), createDefaultDefinitionRegistry());
  }

  const ids = (result: Awaited<ReturnType<typeof loadEdited>>, kind: string) => [
    ...(result.definitions.get(kind)?.keys() ?? []),
  ];

  it('keeps workflows, task types and archetypes loadable when an agent archetype is broken', async () => {
    const loaded = await loadEdited((files) => {
      files['agent-archetype/spec-writer.yaml'] = 'kind: agent-archetype\nschemaVersion: 1\n';
    });

    expect([...(loaded.invalid.get('agent-archetype') ?? [])]).toEqual(['spec-writer']);
    expect(ids(loaded, 'workflow')).toContain('specification-standard');
    expect(ids(loaded, 'task-type')).toEqual(['implementation', 'ui-implementation']);
    expect(ids(loaded, 'specification-archetype')).toContain('feature');

    const dependencies = memoryDependencies(resolveExecutionCatalogue(loaded));
    const result = await work(dependencies, specification); // requirements -> specification
    expect(result.continuation).toEqual({
      kind: 'attention',
      step: 'specification',
      reason: 'archetype-missing',
      archetype: 'spec-writer',
    });
  });

  it('keeps the Specification archetype for documents when its workflow is broken', async () => {
    const loaded = await loadEdited((files) => {
      files['workflow/specification-standard.yaml'] = 'kind: workflow\nschemaVersion: 1\n';
    });

    expect(ids(loaded, 'specification-archetype')).toContain('feature');
    await expect(
      startSpecificationExecution(memoryDependencies(resolveExecutionCatalogue(loaded)), {
        specId: SPEC,
        archetype: 'feature',
      }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_NOT_CONFIGURED' });
  });
});
