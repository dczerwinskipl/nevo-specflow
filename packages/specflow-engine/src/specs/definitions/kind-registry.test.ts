import { Type } from 'typebox';
import { describe, expect, it } from 'vitest';

import {
  DefinitionKindRegistry,
  defineDefinitionKind,
  registerDefinitionKind,
  type DefinitionKind,
} from './kind-registry';
import { createDefaultDefinitionRegistry } from './kinds';
import { loadDefinitions } from './loader';
import { documentTypeFile, sampleProject, toYaml, MemoryDefinitionSource } from './test-support';

interface ReviewKindFile {
  kind: 'review-kind';
  schemaVersion: 1;
  id: string;
  documentType: string;
}

const reviewKind = defineDefinitionKind<ReviewKindFile, { id: string; documentType: string }>({
  kind: 'review-kind',
  auxiliaryDirectories: [],
  dependsOn: ['document-type'],
  schemaVersions: [1],
  maxEntities: 10,
  schema: () =>
    Type.Object(
      {
        kind: Type.Literal('review-kind'),
        schemaVersion: Type.Literal(1),
        id: Type.String(),
        documentType: Type.String(),
      },
      { additionalProperties: false },
    ),
  textLimitViolations: () => [],
  auxiliaryFiles: () => [],
  parse: (file) => ({ id: file.id, documentType: file.documentType }),
  check: (entity, context) =>
    context.lookup('document-type', entity.documentType).state === 'valid'
      ? []
      : [
          {
            code: 'reference-missing',
            location: '/documentType',
            message: `Unknown document type "${entity.documentType}".`,
          },
        ],
  references: (entity) => [{ kind: 'document-type', id: entity.documentType }],
});

function stub(kind: string, dependsOn: string[] = []): DefinitionKind {
  return { ...reviewKind, kind, dependsOn };
}

describe('definition kind registry', () => {
  it('orders kinds with dependencies first, then by name', () => {
    const registry = new DefinitionKindRegistry()
      .register(stub('zeta'))
      .register(stub('alpha', ['zeta']))
      .register(stub('beta'));
    expect(registry.loadOrder().map((kind) => kind.kind)).toEqual(['zeta', 'alpha', 'beta']);
  });

  it('lists the shipped kinds with the document types first', () => {
    expect(
      createDefaultDefinitionRegistry()
        .loadOrder()
        .map((kind) => kind.kind),
    ).toEqual(['document-type', 'specification-archetype']);
  });

  it('refuses a duplicate kind, an invalid name, a missing dependency and a cycle', () => {
    expect(() => new DefinitionKindRegistry().register(stub('a')).register(stub('a'))).toThrow(
      /twice/u,
    );
    expect(() => new DefinitionKindRegistry().register(stub('Bad Name'))).toThrow(
      /directory name/u,
    );
    expect(() => new DefinitionKindRegistry().register(stub('a', ['missing'])).loadOrder()).toThrow(
      /unregistered/u,
    );
    expect(() =>
      new DefinitionKindRegistry()
        .register(stub('a', ['b']))
        .register(stub('b', ['a']))
        .loadOrder(),
    ).toThrow(/depend on each other/u);
    expect(() =>
      new DefinitionKindRegistry().register({ ...stub('a'), schemaVersions: [] }),
    ).toThrow(/no schema version/u);
  });

  it('loads a new kind with no change to the loader', async () => {
    const registry = registerDefinitionKind(createDefaultDefinitionRegistry(), reviewKind);
    const source = sampleProject();
    source.set(
      'review-kind/api.yaml',
      toYaml({ kind: 'review-kind', schemaVersion: 1, id: 'api', documentType: 'note' }),
    );
    source.set(
      'review-kind/ghost.yaml',
      toYaml({ kind: 'review-kind', schemaVersion: 1, id: 'ghost', documentType: 'ghost' }),
    );
    const result = await loadDefinitions(source, registry);
    expect(result.definitions.get('review-kind')?.get('api')?.entity).toEqual({
      id: 'api',
      documentType: 'note',
    });
    expect(result.problems).toMatchObject([
      { source: 'review-kind/ghost.yaml', code: 'reference-missing', kind: 'review-kind' },
    ]);
  });

  it('reports a kind folder that is not registered', async () => {
    const source = new MemoryDefinitionSource({
      'document-type/overview.yaml': documentTypeFile('overview'),
      'review-kind/api.yaml': 'x: 1',
    });
    const result = await loadDefinitions(source, createDefaultDefinitionRegistry());
    expect(result.problems.map((problem) => [problem.source, problem.code])).toEqual([
      ['review-kind', 'unknown-kind-directory'],
    ]);
  });

  it('only resolves the kinds a kind declares as dependencies', async () => {
    const undeclared = defineDefinitionKind<ReviewKindFile, { id: string }>({
      ...(reviewKind as unknown as DefinitionKind<ReviewKindFile, { id: string }>),
      dependsOn: [],
      check: (_entity, context) => {
        context.lookup('document-type', 'overview');
        return [];
      },
    });
    const registry = createDefaultDefinitionRegistry().register(undeclared);
    const source = sampleProject();
    source.set(
      'review-kind/api.yaml',
      toYaml({ kind: 'review-kind', schemaVersion: 1, id: 'api', documentType: 'note' }),
    );
    await expect(loadDefinitions(source, registry)).rejects.toThrow(/does not declare/u);
  });
});
