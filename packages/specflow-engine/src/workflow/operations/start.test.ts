import { beforeAll, describe, expect, it } from 'vitest';

import type { ExecutionCatalogue } from '../definitions/catalogue';
import { inspectExecution } from './inspect';
import {
  SPEC,
  agent,
  claude,
  memoryDependencies,
  owner,
  seedExecutionCatalogue,
  startSpecification,
} from './operations.test-support';
import { startSpecificationExecution } from './start';

let catalogue: ExecutionCatalogue;

beforeAll(async () => {
  catalogue = await seedExecutionCatalogue();
});

describe('start Specification execution', () => {
  it('pins the archetype workflow and starts the interactive requirements step', async () => {
    const dependencies = memoryDependencies(catalogue);
    const started = await startSpecification(dependencies);

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
      run: {
        workflow: { id: 'specification-standard', version: 1 },
        attempts: [{ step: 'requirements', executor: claude }],
      },
    });
  });

  it('resumes the active attempt idempotently', async () => {
    const dependencies = memoryDependencies(catalogue);
    await startSpecification(dependencies);
    const again = await startSpecification(dependencies);

    expect(again).toMatchObject({ kind: 'resumed', context: { attempt: 1 } });
    expect(dependencies.store.applied).toHaveLength(1);
  });

  it('refuses an archetype without an execution binding', async () => {
    const dependencies = memoryDependencies(catalogue);

    await expect(
      startSpecificationExecution(dependencies, {
        specId: SPEC,
        archetype: 'unknown',
        executor: claude,
      }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_NOT_CONFIGURED' });
  });
});

describe('the executor of a started step', () => {
  it('refuses a person on an agent step', async () => {
    const dependencies = memoryDependencies(catalogue);

    await expect(startSpecification(dependencies, owner)).rejects.toMatchObject({
      code: 'WORKFLOW_EXECUTOR_NOT_ALLOWED',
    });
    expect(dependencies.store.applied).toEqual([]);
  });

  it('refuses a start without an executor', async () => {
    const dependencies = memoryDependencies(catalogue);

    await expect(
      startSpecificationExecution(dependencies, {
        specId: SPEC,
        archetype: 'feature',
      } as unknown as Parameters<typeof startSpecificationExecution>[1]),
    ).rejects.toMatchObject({ code: 'WORKFLOW_EXECUTOR_NOT_ALLOWED' });
    expect(dependencies.store.applied).toEqual([]);
  });

  it.each([
    ['another Session of the same provider', agent('claude', 'session-b')],
    ['the same Session id of another provider', agent('codex', 'session-a')],
  ])('refuses %s resuming an active agent attempt', async (_name, other) => {
    const dependencies = memoryDependencies(catalogue);
    await startSpecification(dependencies);

    await expect(startSpecification(dependencies, other)).rejects.toMatchObject({
      code: 'WORKFLOW_EXECUTOR_NOT_ALLOWED',
      message: 'Only the Session that works on "requirements" can resume or finish it.',
    });
    expect(dependencies.store.applied).toHaveLength(1);
  });

  it('refuses a person resuming an active agent step', async () => {
    const dependencies = memoryDependencies(catalogue);
    await startSpecification(dependencies);

    await expect(startSpecification(dependencies, owner)).rejects.toMatchObject({
      code: 'WORKFLOW_EXECUTOR_NOT_ALLOWED',
    });
  });
});
