import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { loadDefinitions } from '../../specs/definitions/loader';
import { createDefaultDefinitionRegistry } from '../../specs/definitions/kinds';
import { locateSeedDirectory, openSeedSource } from '../../specs/definitions/seed';
import { resolveExecutionCatalogue, type ExecutionCatalogue } from '../definitions/catalogue';
import { createMemoryWorkflowStore } from '../state/memory-store.test-support';
import type { ExecutorRecord, WorkflowSubject } from '../state/model';
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

export const agent = (provider: string, sessionId: string, model?: string): ExecutorRecord => ({
  kind: 'agent',
  provider,
  sessionId,
  ...(model !== undefined ? { model } : {}),
});

export const owner: ExecutorRecord = { kind: 'human', actorId: 'owner' };

/** The agent Session that works on the Specification in most tests. */
export const claude = agent('claude', 'session-a', 'claude-opus-5-5');

export const SPEC = 'spec-1';
export const specification: WorkflowSubject = { kind: 'specification', specId: SPEC };
export const task = (taskId: string): WorkflowSubject => ({ kind: 'task', specId: SPEC, taskId });

export type Dependencies = ReturnType<typeof memoryDependencies>;

/** Start the Specification's next step (creating its run from the `feature` archetype). */
export function startSpecification(dependencies: Dependencies, executor: ExecutorRecord = claude) {
  return startSpecificationExecution(dependencies, {
    specId: SPEC,
    archetype: 'feature',
    executor,
  });
}

export async function positionOf(dependencies: Dependencies, subject: WorkflowSubject) {
  const inspection = await inspectExecution(dependencies, SPEC);
  const run =
    subject.kind === 'specification'
      ? inspection.specification?.record.run
      : inspection.tasks.find((entry) => entry.record.taskId === subject.taskId)?.record.run;

  return run?.position;
}

/** Start and finish the subject's next step in one go (what one agent turn does). */
export async function work(
  dependencies: Dependencies,
  subject: WorkflowSubject,
  input: FinishStepInput['input'] = {},
  executor: ExecutorRecord = claude,
) {
  const started =
    subject.kind === 'specification'
      ? await startSpecification(dependencies, executor)
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
export async function specificationWithTasks(dependencies: Dependencies) {
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

/** Runs the Specification until `create-tasks` is active (worked by {@link claude}). */
export async function runToCreateTasks(dependencies: Dependencies) {
  for (let index = 0; index < 4; index += 1) {
    await work(dependencies, specification);
  }

  await work(dependencies, specification, { result: 'pass' });
  const started = await startSpecification(dependencies);
  if (started.kind === 'terminal') {
    throw new Error('Unexpected end.');
  }

  return started.context;
}
