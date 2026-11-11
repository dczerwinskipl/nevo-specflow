import { describe, expect, it } from 'vitest';

import { createDefaultDefinitionRegistry } from '../../definitions/shipped-registry';
import { loadDefinitions } from '../../specs/definitions/loader';
import { MemoryDefinitionSource } from '../../specs/definitions/test-support';
import { resolveExecutionCatalogue } from '../definitions/catalogue';
import {
  memoryDependencies,
  seedDefinitionFiles,
  specification,
  startSpecification,
  work,
} from './operations.test-support';

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
      startSpecification(memoryDependencies(resolveExecutionCatalogue(loaded))),
    ).rejects.toMatchObject({ code: 'WORKFLOW_NOT_CONFIGURED' });
  });
});
