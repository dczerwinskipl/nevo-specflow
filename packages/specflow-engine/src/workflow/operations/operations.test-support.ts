import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { loadDefinitions } from '../../specs/definitions/loader';
import { createDefaultDefinitionRegistry } from '../../definitions/shipped-registry';
import { locateSeedDirectory, openSeedSource } from '../../definitions/seed';
import { resolveExecutionCatalogue, type ExecutionCatalogue } from '../definitions/catalogue';
import { createMemoryWorkflowStore } from '../state/memory-store.test-support';
import type { OwnerActor, WorkflowActor, WorkflowSubject } from '../state/model';
import { finishStep, type FinishStepInput } from './finish';
import { inspectExecution } from './inspect';
import type { WorkflowDependencies } from './loaded-execution';
import { startSpecificationExecution, startTaskExecution } from './start';

/** The execution catalogue of the shipped seed definitions. */
export async function seedExecutionCatalogue(): Promise<ExecutionCatalogue> {
  const seeds = await openSeedSource();

  return resolveExecutionCatalogue(
    await loadDefinitions(seeds.source, createDefaultDefinitionRegistry()),
  );
}

/** Every shipped seed file by its path relative to the definitions folder, to copy and edit. */
export async function seedDefinitionFiles(): Promise<Record<string, string>> {
  const directory = await locateSeedDirectory();
  const files: Record<string, string> = {};
  for (const entry of await readdir(directory, { recursive: true, withFileTypes: true })) {
    if (entry.isFile()) {
      const path = join(entry.parentPath, entry.name);
      files[path.slice(directory.length + 1).replaceAll('\\', '/')] = await readFile(path, 'utf8');
    }
  }

  return files;
}

/** Dependencies over an in-memory store with a clock that advances one second per reading. */
export function memoryDependencies(catalogue: ExecutionCatalogue): WorkflowDependencies & {
  readonly store: ReturnType<typeof createMemoryWorkflowStore>;
} {
  let tick = Date.parse('2026-11-05T10:00:00.000Z');
  let queue = Promise.resolve();

  return {
    store: createMemoryWorkflowStore(),
    catalogue,
    now: () => new Date((tick += 1000)),
    serialize: <T>(operation: () => Promise<T>) => {
      const result = queue.then(operation);
      queue = result.then(
        () => undefined,
        () => undefined,
      );

      return result;
    },
  };
}

export const agent = (provider: string, sessionId: string, model?: string): WorkflowActor => ({
  class: 'agent',
  details: { provider, sessionId, ...(model !== undefined ? { model } : {}) },
});

export const owner: OwnerActor = { class: 'human', details: { actorId: 'owner', trust: 'local' } };

/** The agent Session that works on the Specification in most tests. */
export const claude = agent('claude', 'session-a', 'claude-opus-5-5');

/** A valid Specification id, so the same helpers also run against the filesystem store. */
export const SPEC = '0b9d2f9e-4f1c-4a8e-9d55-5f2b6c1a7e10';
export const specification: WorkflowSubject = { kind: 'specification', specId: SPEC };
export const task = (taskId: string): WorkflowSubject => ({ kind: 'task', specId: SPEC, taskId });

export type Dependencies = ReturnType<typeof memoryDependencies>;

/** Start the Specification's next step (creating its run from the `feature` archetype). */
export function startSpecification(
  dependencies: WorkflowDependencies,
  actor: WorkflowActor = claude,
) {
  return startSpecificationExecution(dependencies, {
    specId: SPEC,
    archetype: 'feature',
    actor,
  });
}

export async function positionOf(dependencies: WorkflowDependencies, subject: WorkflowSubject) {
  const inspection = await inspectExecution(dependencies, SPEC);
  const run =
    subject.kind === 'specification'
      ? inspection.specification?.record.run
      : inspection.tasks.find((entry) => entry.record.taskId === subject.taskId)?.record.run;

  return run?.position;
}

/** Start and finish the subject's next step in one go (what one agent turn does). */
export async function work(
  dependencies: WorkflowDependencies,
  subject: WorkflowSubject,
  input: FinishStepInput['input'] = {},
  actor: WorkflowActor = claude,
) {
  const started =
    subject.kind === 'specification'
      ? await startSpecification(dependencies, actor)
      : await startTaskExecution(dependencies, { specId: SPEC, taskId: subject.taskId, actor });
  if (started.kind === 'terminal') {
    throw new Error('Nothing to start.');
  }

  return finishStep(dependencies, {
    subject,
    step: started.context.step.id,
    attempt: started.context.attempt,
    input,
    actor,
  });
}

/** The two Tasks of {@link specificationWithTasks}: `api`, then `screen` depending on it. */
export const TWO_TASKS = [
  { id: 'api', title: 'API', type: 'implementation' },
  { id: 'screen', title: 'Screen', type: 'ui-implementation', dependsOn: ['api'] },
] as const;

/**
 * Runs the Specification up to the wait step: the breakdown drafts {@link TWO_TASKS} and the
 * review's pass approves them. Returns the finish of the review.
 */
export async function specificationWithTasks(dependencies: WorkflowDependencies) {
  await runToBreakdown(dependencies);
  await finishStep(dependencies, {
    subject: specification,
    step: 'breakdown',
    attempt: 1,
    input: { tasks: TWO_TASKS },
    actor: claude,
  });

  return work(dependencies, specification, { result: 'pass' }, agent('codex', 'session-r', 'x'));
}

/** Runs the Specification until `breakdown` is active (worked by {@link claude}). */
export async function runToBreakdown(dependencies: WorkflowDependencies) {
  for (let index = 0; index < 3; index += 1) {
    await work(dependencies, specification);
  }

  const started = await startSpecification(dependencies);
  if (started.kind === 'terminal') {
    throw new Error('Unexpected end.');
  }

  return started.context;
}
