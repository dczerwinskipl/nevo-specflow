import { beforeAll, describe, expect, it } from 'vitest';

import { createDefaultDefinitionRegistry } from '../../definitions/shipped-registry';
import { loadDefinitions } from '../../specs/definitions/loader';
import { MemoryDefinitionSource } from '../../specs/definitions/test-support';
import { resolveExecutionCatalogue, type ExecutionCatalogue } from '../definitions/catalogue';
import { inspectActions, relationStepsOf, type ActionPosition } from './actions';
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
import { createTask, editTask } from './task-resource';
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
      "    purpose: The Task's change works and stays within its scope.\n",
      [
        "    purpose: The Task's change works and stays within its scope.",
        '    exitGates:',
        '      - id: findings',
        '        type: document',
        '        documentType: research',
        '        requiredSections: [Findings]',
        '',
      ].join('\n'),
    )
    .replace(
      '    purpose: The change is confirmed correct, in scope and within repository rules.\n',
      [
        '    purpose: The change is confirmed correct, in scope and within repository rules.',
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
      "    purpose: The Task's change works and stays within its scope.\n",
      [
        "    purpose: The Task's change works and stays within its scope.",
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
            labelDeclared: false,
            documentType: 'research',
            requiredSections: ['Findings'],
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

describe('document relations', () => {
  it('name the documents the active and the next step gate, the strongest relation each', async () => {
    const dependencies = memoryDependencies(catalogue);
    await implementing(dependencies);
    const relations = async () =>
      (await inspectActions(dependencies, task('api'))).documentRelations;
    const implement = { id: 'implement', title: 'Implement', active: true };
    const review = { id: 'review', title: 'Review', active: false };

    // No document of either type: a gate that found none names nothing.
    expect(await relations()).toEqual([]);

    // A registered research document without a file, and a satisfying note of the Specification.
    dependencies.references.gateDocuments.push(research(undefined), {
      type: 'note',
      id: 'decision',
      present: true,
    });
    expect(await relations()).toEqual([
      {
        scope: { kind: 'task', specId: SPEC, taskId: 'api' },
        documentId: 'findings',
        relation: 'needed-to-finish',
        blocksNow: true,
        step: implement,
        gate: {
          id: 'findings',
          label: 'A "research" document with Findings',
          labelDeclared: false,
          documentType: 'research',
          requiredSections: ['Findings'],
        },
      },
      {
        scope: { kind: 'specification', specId: SPEC },
        documentId: 'decision',
        relation: 'used',
        blocksNow: false,
        step: review,
        gate: {
          id: 'entry-1',
          label: 'A "note" document',
          labelDeclared: false,
          documentType: 'note',
          requiredSections: [],
        },
      },
    ]);

    dependencies.references.gateDocuments.splice(0, 1, research('# Notes\n'));
    expect((await relations())?.[0]).toMatchObject({
      relation: 'needed-to-finish',
      gate: { missingSections: ['Findings'] },
    });

    // While implement is active, the review's unmet entry gate does not block anything now.
    dependencies.references.gateDocuments.splice(1, 1, {
      type: 'note',
      id: 'decision',
      present: false,
    });
    expect((await relations())?.[1]).toMatchObject({
      documentId: 'decision',
      relation: 'needed-to-start',
      blocksNow: false,
      step: review,
    });

    // After the finish the review is the step a start would activate (blocked): now it blocks.
    dependencies.references.gateDocuments.splice(0, 1, research('## Findings\n'));
    expect((await relations())?.[0]).toMatchObject({ documentId: 'findings', relation: 'used' });
    await finishImplement(dependencies);
    expect((await inspectActions(dependencies, task('api'))).position.kind).toBe('blocked');
    expect(await relations()).toEqual([
      expect.objectContaining({
        documentId: 'decision',
        relation: 'needed-to-start',
        blocksNow: true,
        step: review,
      }),
    ]);

    // Ready: the satisfied entry gate is used and blocks nothing.
    dependencies.references.gateDocuments.splice(1, 1, {
      type: 'note',
      id: 'decision',
      present: true,
    });
    expect((await inspectActions(dependencies, task('api'))).position.kind).toBe('ready');
    expect(await relations()).toEqual([
      expect.objectContaining({ documentId: 'decision', relation: 'used', blocksNow: false }),
    ]);
  });

  it('read the next step of a waiting run as starting later', () => {
    const definition = catalogue.workflow('task-standard')!;
    const waiting = { kind: 'waiting', step: { id: 'implement' } } as unknown as ActionPosition;
    const steps = relationStepsOf(definition, waiting);
    expect(steps.active).toBeUndefined();
    expect(steps.next).toMatchObject({ step: { id: 'review' }, startsNow: false });
  });

  it('do not name a document for an unmet exit gate that applies to some results only', async () => {
    const files = await seedDefinitionFiles();
    files['workflow/task-standard.yaml'] = (files['workflow/task-standard.yaml'] ?? '').replace(
      '    purpose: The change is confirmed correct, in scope and within repository rules.\n',
      [
        '    purpose: The change is confirmed correct, in scope and within repository rules.',
        '    exitGates:',
        '      - id: verdict',
        '        type: document',
        '        documentType: research',
        '        requiredSections: [Verdict]',
        '        when: [pass]',
        '',
      ].join('\n'),
    );
    const loaded = await loadDefinitions(
      new MemoryDefinitionSource(files),
      createDefaultDefinitionRegistry(),
    );
    expect([...(loaded.invalid.get('workflow') ?? [])]).toEqual([]);
    const dependencies = memoryDependencies(resolveExecutionCatalogue(loaded));
    await implementing(dependencies);
    await finishImplement(dependencies);
    await startTaskExecution(dependencies, { specId: SPEC, taskId: 'api', actor: owner });
    const relations = async () =>
      (await inspectActions(dependencies, task('api'))).documentRelations;

    dependencies.references.gateDocuments.push(research('# Notes\n'));
    expect(await relations()).toEqual([]);

    dependencies.references.gateDocuments.splice(0, 1, research('## Verdict\n'));
    expect(await relations()).toEqual([
      expect.objectContaining({
        documentId: 'findings',
        relation: 'used',
        blocksNow: false,
        step: { id: 'review', title: 'Review', active: true },
      }),
    ]);
  });
});

describe('own documents as context artifacts', () => {
  it('refuses a required one on create and edit (a gate expresses it); an optional one is allowed', async () => {
    const dependencies = memoryDependencies(catalogue);
    const own = { kind: 'task-document' as const, id: 'findings', artifact: true };
    const create = (required: boolean) =>
      createTask(dependencies, {
        specId: SPEC,
        taskId: 'api',
        title: 'API',
        type: 'implementation',
        actor: owner,
        context: [
          { kind: 'path', path: 'packages/specflow-engine/src', required: true },
          { ...own, required },
        ],
      });

    const applied = dependencies.store.applied.length;
    const refusal = create(true);
    await expect(refusal).rejects.toMatchObject({
      code: 'WORKFLOW_INPUT_INVALID',
      invalidContext: [
        { index: 1, key: 'task-document:findings', reason: 'required-own-artifact' },
      ],
    });
    await expect(refusal).rejects.toThrow(/exit gate on the producing step/u);
    expect(dependencies.store.applied).toHaveLength(applied);

    const created = await create(false);
    await expect(
      editTask(dependencies, {
        specId: SPEC,
        taskId: 'api',
        expectedRevision: created.revision,
        actor: owner,
        context: [{ ...own, required: true }],
      }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_INPUT_INVALID', invalidContext: [{ index: 0 }] });
  });
});

describe('step titles in the projection', () => {
  it('name the first step of the pin preview, the transition targets and the return targets', async () => {
    const dependencies = memoryDependencies(catalogue);
    await createTask(dependencies, {
      specId: SPEC,
      taskId: 'api',
      title: 'API',
      type: 'implementation',
      actor: owner,
    });
    await setTaskStatus(dependencies, {
      specId: SPEC,
      taskId: 'api',
      status: 'ready',
      actor: owner,
    });
    expect((await inspectActions(dependencies, task('api'))).position).toMatchObject({
      preview: { firstStep: 'implement', firstStepTitle: 'Implement' },
    });

    await startTaskExecution(dependencies, { specId: SPEC, taskId: 'api', actor: owner });
    const { actions } = await inspectActions(dependencies, task('api'));
    expect(actions.finish?.transitions[0]).toMatchObject({ targetTitle: 'Review' });
    expect(actions.return?.targets).toEqual([
      {
        step: 'implement',
        title: 'Implement',
        label: 'Back to implementation',
        feedback: 'required',
      },
    ]);
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
