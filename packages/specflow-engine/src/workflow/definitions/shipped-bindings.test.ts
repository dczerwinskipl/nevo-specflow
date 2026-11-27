import { describe, expect, it } from 'vitest';

import { createDefaultDefinitionRegistry } from '../../definitions/shipped-registry';
import { loadDefinitions } from '../../specs/definitions/loader';
import { MemoryDefinitionSource } from '../../specs/definitions/test-support';
import { seedDefinitionFiles } from '../operations/operations.test-support';
import { resolveTaskType } from '../tasks/tasks';
import {
  archetypeFirstStep,
  resolveExecutionCatalogue,
  resolveSpecificationExecution,
} from './catalogue';

// The agent of a Task step comes from the step of the workflow its task type names. A Specification
// archetype that does not allow `ui-implementation` makes every UI Task an `implementation` one, run
// by `implementer` without the frontend rules (dogfood #189, an Architecture Specification).
describe('the shipped Specification archetypes', () => {
  it('let a UI Task reach the implementer-ui agent', async () => {
    const loaded = await loadDefinitions(
      new MemoryDefinitionSource(await seedDefinitionFiles()),
      createDefaultDefinitionRegistry(),
    );
    const catalogue = resolveExecutionCatalogue(loaded);
    const archetypes = [...(loaded.definitions.get('specification-archetype')?.keys() ?? [])];
    expect(archetypes).toEqual(expect.arrayContaining(['architecture', 'feature', 'minimal']));

    for (const archetype of archetypes) {
      const binding = resolveSpecificationExecution(catalogue, archetype);
      if (binding.kind !== 'resolved') {
        throw new Error(binding.message);
      }

      const { workflow } = resolveTaskType({
        type: 'ui-implementation',
        allowed: binding.taskTypes,
        taskType: (id) => catalogue.taskType(id),
        workflow: (id) => catalogue.workflow(id),
      });
      const implement = workflow.steps.find((step) => step.id === workflow.entryStep);
      expect(implement?.kind === 'work' ? implement.annotations.archetype : undefined).toBe(
        'implementer-ui',
      );
    }
  });
});

describe('archetypeFirstStep', () => {
  it("names each shipped archetype's entry step and whether an agent may do it", async () => {
    const loaded = await loadDefinitions(
      new MemoryDefinitionSource(await seedDefinitionFiles()),
      createDefaultDefinitionRegistry(),
    );
    const catalogue = resolveExecutionCatalogue(loaded);

    for (const archetype of ['architecture', 'feature', 'minimal']) {
      const binding = resolveSpecificationExecution(catalogue, archetype);
      if (binding.kind !== 'resolved') {
        throw new Error(binding.message);
      }

      const entry = binding.workflow.steps.find((step) => step.id === binding.workflow.entryStep)!;
      expect(archetypeFirstStep(catalogue, archetype)).toEqual({
        id: entry.id,
        title: entry.title,
        agent: entry.kind === 'work' && entry.executors.includes('agent'),
      });
    }

    expect(archetypeFirstStep(catalogue, 'no-such-archetype')).toBeUndefined();
  });
});
