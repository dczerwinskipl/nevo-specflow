import { beforeAll, describe, expect, it } from 'vitest';

import { createDefaultDefinitionRegistry } from '../../definitions/shipped-registry';
import { loadDefinitions } from '../../specs/definitions/loader';
import { MemoryDefinitionSource } from '../../specs/definitions/test-support';
import { resolveExecutionCatalogue, type ExecutionCatalogue } from '../definitions/catalogue';
import { inspectActions } from './actions';
import { finishStep } from './finish';
import {
  memoryDependencies,
  owner,
  SPEC,
  seedDefinitionFiles,
  task,
  type Dependencies,
} from './operations.test-support';
import { startTaskExecution } from './start';
import { createTask } from './task-resource';
import { setTaskStatus } from './task-status';

/**
 * The seed Task workflow with gates: `implement` needs a `research` document of the Task with a
 * "Findings" section to finish; `review` needs a `note` of the Specification to start.
 */
async function gatedCatalogue(): Promise<ExecutionCatalogue> {
  const files = await seedDefinitionFiles();
  const workflow = files['workflow/task-standard.yaml'] ?? '';
  files['workflow/task-standard.yaml'] = workflow
    .replace(
      '    purpose: Implement the Task within its scope and run its verification.\n',
      [
        '    purpose: Implement the Task within its scope and run its verification.',
        '    exitGates:',
        '      - id: findings',
        '        type: document',
        '        documentType: research',
        '        requiredSections: [Findings]',
        '',
      ].join('\n'),
    )
    .replace(
      '    purpose: Review the change independently against the Task and the repository rules.\n',
      [
        '    purpose: Review the change independently against the Task and the repository rules.',
        '    entryGates:',
        '      - type: document',
        '        documentType: note',
        '        scope: specification',
        '',
      ].join('\n'),
    );
  const loaded = await loadDefinitions(
    new MemoryDefinitionSource(files),
    createDefaultDefinitionRegistry(),
  );
  expect([...(loaded.invalid.get('workflow') ?? [])]).toEqual([]);

  return resolveExecutionCatalogue(loaded);
}

let catalogue: ExecutionCatalogue;

beforeAll(async () => {
  catalogue = await gatedCatalogue();
});

describe('a gate document type', () => {
  it('must be defined, and installing the workflow installs it', async () => {
    const files = await seedDefinitionFiles();
    files['workflow/task-standard.yaml'] = (files['workflow/task-standard.yaml'] ?? '').replace(
      '    purpose: Implement the Task within its scope and run its verification.\n',
      [
        '    purpose: Implement the Task within its scope and run its verification.',
        '    exitGates: [{ type: document, documentType: findings }]',
        '',
      ].join('\n'),
    );
    const loaded = await loadDefinitions(
      new MemoryDefinitionSource(files),
      createDefaultDefinitionRegistry(),
    );

    expect([...(loaded.invalid.get('workflow') ?? [])]).toEqual(['task-standard']);
    expect(loaded.problems).toContainEqual(
      expect.objectContaining({
        code: 'reference-missing',
        location: '/steps/0/exitGates/0/documentType',
      }),
    );
  });
});

/** A ready Task `api` whose `implement` step the owner started. */
async function implementing(dependencies: Dependencies) {
  await createTask(dependencies, {
    specId: SPEC,
    taskId: 'api',
    title: 'API',
    type: 'implementation',
    actor: owner,
  });
  await setTaskStatus(dependencies, { specId: SPEC, taskId: 'api', status: 'ready', actor: owner });
  await startTaskExecution(dependencies, { specId: SPEC, taskId: 'api', actor: owner });
}

const finishImplement = (dependencies: Dependencies) =>
  finishStep(dependencies, {
    subject: task('api'),
    step: 'implement',
    attempt: 1,
    input: {},
    actor: owner,
  });

const research = (text: string | undefined) => ({
  taskId: 'api',
  type: 'research',
  id: 'findings',
  present: text !== undefined,
  ...(text !== undefined ? { text } : {}),
});

describe('exit gates', () => {
  it('are shown on the finish transitions and refuse the finish before anything is written', async () => {
    const dependencies = memoryDependencies(catalogue);
    await implementing(dependencies);

    const finish = async () => (await inspectActions(dependencies, task('api'))).actions.finish;
    expect((await finish())?.transitions).toEqual([
      expect.objectContaining({
        id: 'implemented',
        unavailable: 'gate-unsatisfied',
        gates: [
          {
            id: 'findings',
            type: 'document',
            label: 'A "research" document with Findings',
            documentType: 'research',
            scope: { kind: 'task', specId: SPEC, taskId: 'api' },
            status: 'unsatisfied',
            reason: 'no-document',
          },
        ],
      }),
    ]);

    dependencies.references.gateDocuments.push(research(undefined));
    expect((await finish())?.transitions[0]?.gates?.[0]).toMatchObject({ reason: 'file-missing' });

    dependencies.references.gateDocuments.splice(0, 1, research('# Notes\n'));
    const applied = dependencies.store.applied.length;
    await expect(finishImplement(dependencies)).rejects.toMatchObject({
      code: 'WORKFLOW_GATE_UNSATISFIED',
      phase: 'exit',
      step: 'implement',
      gates: [
        expect.objectContaining({
          id: 'findings',
          reason: 'sections-missing',
          documentId: 'findings',
          missingSections: ['Findings'],
        }),
      ],
    });
    expect(dependencies.store.applied).toHaveLength(applied);

    dependencies.references.gateDocuments.splice(0, 1, research('# Research\n\n## Findings\n'));
    expect((await finish())?.transitions[0]).toMatchObject({
      gates: [{ status: 'satisfied', documentId: 'findings' }],
    });
    expect((await finish())?.transitions[0]?.unavailable).toBeUndefined();
    expect((await finishImplement(dependencies)).position).toEqual({
      state: 'ready',
      step: 'review',
    });
  });

  it('are not evaluated again when a finished attempt is replayed', async () => {
    const dependencies = memoryDependencies(catalogue);
    await implementing(dependencies);
    dependencies.references.gateDocuments.push(research('## Findings\n'));
    await finishImplement(dependencies);

    // The document is gone, but the repeated request returns the recorded finish.
    dependencies.references.gateDocuments.length = 0;
    const reads = dependencies.references.gateReads;
    await expect(finishImplement(dependencies)).resolves.toMatchObject({ replayed: true });
    expect(dependencies.references.gateReads).toBe(reads);
  });
});

describe('entry gates', () => {
  it('block the start of their step, shown on the next step and refused before a write', async () => {
    const dependencies = memoryDependencies(catalogue);
    await implementing(dependencies);
    dependencies.references.gateDocuments.push(research('## Findings\n'));
    await finishImplement(dependencies);

    const projection = await inspectActions(dependencies, task('api'));
    expect(projection.actions.start).toBeUndefined();
    expect(projection.position).toMatchObject({
      kind: 'blocked',
      blockers: [
        {
          kind: 'gates-unsatisfied',
          gates: [{ id: 'entry-1', scope: { kind: 'specification', specId: SPEC } }],
        },
      ],
      next: { entryGates: [{ id: 'entry-1', status: 'unsatisfied', reason: 'no-document' }] },
    });

    const applied = dependencies.store.applied.length;
    const start = () =>
      startTaskExecution(dependencies, { specId: SPEC, taskId: 'api', actor: owner });
    await expect(start()).rejects.toMatchObject({
      code: 'WORKFLOW_GATE_UNSATISFIED',
      phase: 'entry',
      step: 'review',
    });
    expect(dependencies.store.applied).toHaveLength(applied);

    dependencies.references.gateDocuments.push({ type: 'note', id: 'decision', present: true });
    expect((await inspectActions(dependencies, task('api'))).position).toMatchObject({
      kind: 'ready',
      next: { entryGates: [{ status: 'satisfied', documentId: 'decision' }] },
    });
    await expect(start()).resolves.toMatchObject({ kind: 'started' });
  });
});

describe('process artifacts in the context', () => {
  it('are awaited while missing: accepted on create, shown apart and listed apart on a refused start', async () => {
    const dependencies = memoryDependencies(catalogue);
    const entry = {
      kind: 'specification-document' as const,
      id: 'findings',
      required: true,
    };
    await expect(
      createTask(dependencies, {
        specId: SPEC,
        taskId: 'api',
        title: 'API',
        type: 'implementation',
        actor: owner,
        context: [entry],
      }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_TASK_CONTEXT_UNRESOLVED' });

    await createTask(dependencies, {
      specId: SPEC,
      taskId: 'api',
      title: 'API',
      type: 'implementation',
      actor: owner,
      context: [
        { ...entry, artifact: true },
        { kind: 'path', path: 'packages/specflow-engine/src', required: true },
      ],
    });
    await setTaskStatus(dependencies, {
      specId: SPEC,
      taskId: 'api',
      status: 'ready',
      actor: owner,
    });
    dependencies.references.paths.clear();

    expect((await inspectActions(dependencies, task('api'))).position).toMatchObject({
      kind: 'blocked',
      blockers: [
        { kind: 'context-unresolved', entries: [{ index: 1, kind: 'path', reason: 'not-found' }] },
        { kind: 'context-awaited', entries: [{ index: 0, kind: 'specification-document' }] },
      ],
    });
    await expect(
      startTaskExecution(dependencies, { specId: SPEC, taskId: 'api', actor: owner }),
    ).rejects.toMatchObject({
      code: 'WORKFLOW_TASK_CONTEXT_UNRESOLVED',
      unresolved: [{ index: 1, key: 'path:packages/specflow-engine/src', reason: 'not-found' }],
      awaited: [{ index: 0, key: 'specification-document:findings' }],
    });

    dependencies.references.paths.add('packages/specflow-engine/src');
    dependencies.references.specificationDocuments.add('findings');
    await expect(
      startTaskExecution(dependencies, { specId: SPEC, taskId: 'api', actor: owner }),
    ).resolves.toMatchObject({ kind: 'started' });
  });
});
