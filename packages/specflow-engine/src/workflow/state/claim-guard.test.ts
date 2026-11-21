import { beforeAll, describe, expect, it } from 'vitest';

import { MemoryDefinitionSource } from '../../specs/definitions/test-support';
import type { ExecutionCatalogue } from '../definitions/catalogue';
import { rememberArchetypeModel } from '../definitions/remember-model';
import { SpecificationBusyError } from '../errors';
import { abandonSpecification } from '../operations/abandon';
import { finishStep } from '../operations/finish';
import { inspectExecution } from '../operations/inspect';
import {
  SPEC,
  claude,
  memoryDependencies,
  owner,
  seedExecutionCatalogue,
  specification,
  specificationWithTasks,
  startSpecification,
  task,
} from '../operations/operations.test-support';
import { reevaluateWait } from '../operations/reevaluate-wait';
import { returnToStep } from '../operations/return';
import { startTaskExecution } from '../operations/start';
import { createTask, editTask, removeTask } from '../operations/task-resource';
import { setTaskStatus } from '../operations/task-status';
import type { WorkflowDependencies } from '../operations/loaded-execution';
import type { WorkflowWriteAdmission } from '../write-admission';
import { guardExecutionClaims } from './claim-guard';

let catalogue: ExecutionCatalogue;
beforeAll(async () => {
  catalogue = await seedExecutionCatalogue();
});

/** An agent Turn's claim a test holds and releases (the production admission is the Engine's). */
function claim(): WorkflowWriteAdmission & { held: boolean; checks: number } {
  const admission = {
    held: false,
    checks: 0,
    admitWrite() {
      admission.checks += 1;

      return admission.held
        ? Promise.reject(
            new SpecificationBusyError('An agent Session Turn (Session s-1) holds the claim.', {
              cause: 'agent-turn',
              sessionId: 's-1',
            }),
          )
        : Promise.resolve();
    },
  };

  return admission;
}

const revisionOf = async (dependencies: WorkflowDependencies, taskId: string) =>
  (await inspectExecution(dependencies, SPEC)).tasks.find((entry) => entry.record.taskId === taskId)
    ?.revision ?? '';

const atTasks = (dependencies: WorkflowDependencies) => specificationWithTasks(dependencies);

/**
 * Every kernel writer, from a state in which it would write: `prepare` runs with the claim released
 * and returns the write. The offline owner CLI and the Runtime routes call these same operations.
 */
const WRITERS: readonly {
  readonly name: string;
  readonly prepare: (dependencies: WorkflowDependencies) => Promise<() => Promise<unknown>>;
}[] = [
  {
    name: 'start of the Specification',
    prepare: (dependencies) => Promise.resolve(() => startSpecification(dependencies)),
  },
  {
    name: 'start of a Task',
    prepare: async (dependencies) => {
      await atTasks(dependencies);

      return () => startTaskExecution(dependencies, { specId: SPEC, taskId: 'api', actor: claude });
    },
  },
  {
    name: 'finish',
    prepare: async (dependencies) => {
      await atTasks(dependencies);
      await startTaskExecution(dependencies, { specId: SPEC, taskId: 'api', actor: claude });
      const step = (await inspectExecution(dependencies, SPEC)).tasks[0]?.record.run?.position;

      return () =>
        finishStep(dependencies, {
          subject: task('api'),
          step: step?.state === 'active' ? step.step : '',
          attempt: step?.state === 'active' ? step.attempt : 0,
          input: {},
          actor: claude,
        });
    },
  },
  {
    // Applying a return during a foreign agent claim is refused; recording it is T15's journal.
    name: 'return',
    prepare: async (dependencies) => {
      await atTasks(dependencies);

      return () =>
        returnToStep(dependencies, {
          actor: owner,
          subject: specification,
          step: 'breakdown',
          feedback: 'Add an audit Task.',
        });
    },
  },
  {
    name: 're-evaluation of a wait (its roll-forward too)',
    prepare: async (dependencies) => {
      await atTasks(dependencies);
      const wait = (await inspectExecution(dependencies, SPEC)).specification?.record.run.position;
      for (const taskId of ['screen', 'api']) {
        await setTaskStatus(dependencies, {
          specId: SPEC,
          taskId,
          status: 'cancelled',
          reason: 'Not needed.',
          actor: owner,
        });
      }

      return () =>
        reevaluateWait(dependencies, {
          specId: SPEC,
          step: wait?.state === 'active' ? wait.step : '',
          attempt: wait?.state === 'active' ? wait.attempt : 0,
          actor: owner,
        });
    },
  },
  {
    name: 'abandon',
    prepare: async (dependencies) => {
      await atTasks(dependencies);

      return () =>
        abandonSpecification(dependencies, { specId: SPEC, reason: 'Dropped.', actor: owner });
    },
  },
  {
    name: 'Task create',
    prepare: async (dependencies) => {
      await atTasks(dependencies);

      return () =>
        createTask(dependencies, {
          specId: SPEC,
          taskId: 'docs',
          title: 'Docs',
          type: 'implementation',
          actor: owner,
        });
    },
  },
  {
    name: 'Task edit',
    prepare: async (dependencies) => {
      await atTasks(dependencies);
      const expectedRevision = await revisionOf(dependencies, 'api');

      return () =>
        editTask(dependencies, {
          specId: SPEC,
          taskId: 'api',
          expectedRevision,
          title: 'API v2',
          actor: owner,
        });
    },
  },
  {
    name: 'Task removal',
    prepare: async (dependencies) => {
      await atTasks(dependencies);
      const expectedRevision = await revisionOf(dependencies, 'screen');

      return () =>
        removeTask(dependencies, {
          specId: SPEC,
          taskId: 'screen',
          expectedRevision,
          actor: owner,
        });
    },
  },
  {
    name: 'Task status',
    prepare: async (dependencies) => {
      await atTasks(dependencies);

      return () =>
        setTaskStatus(dependencies, {
          specId: SPEC,
          taskId: 'api',
          status: 'on-hold',
          reason: 'Later.',
          actor: owner,
        });
    },
  },
];

describe('guardExecutionClaims', () => {
  it.each(WRITERS)(
    '$name: refused while a foreign agent claim holds, written once it settles',
    async ({ prepare }) => {
      const base = memoryDependencies(catalogue);
      const admission = claim();
      const dependencies = { ...base, store: guardExecutionClaims(base.store, admission) };
      const write = await prepare(dependencies);
      const written = base.store.applied.length;
      const before = await inspectExecution(dependencies, SPEC);

      admission.held = true;
      const checks = admission.checks;
      await expect(write()).rejects.toMatchObject({
        code: 'WORKFLOW_SPECIFICATION_BUSY',
        busy: { cause: 'agent-turn', sessionId: 's-1' },
      });
      expect(admission.checks).toBeGreaterThan(checks);
      expect(base.store.applied).toHaveLength(written);
      // Reads stay available while the claim holds.
      expect(await inspectExecution(dependencies, SPEC)).toEqual(before);

      admission.held = false;
      await expect(write()).resolves.toBeDefined();
    },
  );

  it('refuses an archetype edit while the claim holds, and writes it once released', async () => {
    const PATH = 'agent-archetype/reviewer.yaml';
    const files = new MemoryDefinitionSource({
      [PATH]:
        'kind: agent-archetype\nschemaVersion: 1\nid: reviewer\ntitle: Reviewer\n' +
        'description: Reviews.\nproviders:\n  - provider: codex\n',
    });
    const admission = claim();
    admission.held = true;
    const dependencies = {
      source: files,
      writer: files,
      serialize: <T>(operation: () => Promise<T>) => operation(),
      admission,
    };
    const choice = { provider: 'codex', model: 'gpt-x' };

    await expect(rememberArchetypeModel(dependencies, 'reviewer', choice)).rejects.toMatchObject({
      code: 'WORKFLOW_SPECIFICATION_BUSY',
    });
    expect(files.text(PATH)).not.toContain('gpt-x');

    admission.held = false;
    await rememberArchetypeModel(dependencies, 'reviewer', choice);
    expect(files.text(PATH)).toContain('model: gpt-x');
  });
});
