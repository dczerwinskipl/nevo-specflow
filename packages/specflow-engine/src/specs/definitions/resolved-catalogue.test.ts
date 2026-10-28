import type {
  ArchetypeDefinition,
  DocumentTypeDefinition,
} from '@nevo/specflow-contracts/documents';
import { describe, expect, it } from 'vitest';

import { canonicalJson, resolveCatalogue, type CatalogueEntities } from './resolved-catalogue';
import { seedCatalogueForTesting } from './testing-install';

const seeds = await seedCatalogueForTesting();

function entities(): {
  documentTypes: DocumentTypeDefinition[];
  archetypes: ArchetypeDefinition[];
} {
  return {
    documentTypes: structuredClone([...seeds.documentTypes]),
    archetypes: structuredClone([...seeds.archetypes]),
  };
}

describe('resolveCatalogue', () => {
  it('has a stable sha256 revision that does not depend on the seed loader', () => {
    expect(seeds.revision).toMatch(/^[0-9a-f]{64}$/u);
    expect(resolveCatalogue(entities()).revision).toBe(seeds.revision);
  });

  it('is independent of object key order', () => {
    const reordered = JSON.parse(
      JSON.stringify(entities(), (_key, value: unknown) =>
        value && typeof value === 'object' && !Array.isArray(value)
          ? Object.fromEntries(Object.entries(value).reverse())
          : value,
      ),
    ) as CatalogueEntities;
    expect(resolveCatalogue(reordered).revision).toBe(seeds.revision);
  });

  it.each([
    [
      'a document type title',
      (f: ReturnType<typeof entities>) => void (f.documentTypes[1]!.title = 'Changed'),
    ],
    [
      'an instruction',
      (f: ReturnType<typeof entities>) => void (f.documentTypes[0]!.instructions += ' '),
    ],
    [
      'an archetype version',
      (f: ReturnType<typeof entities>) => void (f.archetypes[0]!.version = 2),
    ],
    [
      'template content',
      (f: ReturnType<typeof entities>) => void (f.archetypes[1]!.templates[1]!.content += 'x'),
    ],
    [
      'a requirement',
      (f: ReturnType<typeof entities>) =>
        void f.archetypes[2]!.requirements.push({ documentType: 'decisions', minCount: 1 }),
    ],
    [
      'the template order',
      (f: ReturnType<typeof entities>) => void f.archetypes[0]!.templates.reverse(),
    ],
  ])('changes when %s changes', (_name, edit) => {
    const edited = entities();
    edit(edited);
    expect(resolveCatalogue(edited).revision).not.toBe(seeds.revision);
  });

  it('copies and freezes its input, so the catalogue cannot change afterwards', () => {
    const input = entities();
    const catalogue = resolveCatalogue(input);
    input.archetypes[0]!.version = 99;
    expect(catalogue.archetypes[0]!.version).toBe(1);
    expect(Object.isFrozen(catalogue.archetypes[0])).toBe(true);
    expect(Object.isFrozen(catalogue.archetypes[0]!.templates[0])).toBe(true);
  });

  it('finds document types, archetypes and templates by id', () => {
    expect(seeds.findDocumentType('overview')?.title).toBe('Overview');
    expect(seeds.findArchetype('feature')?.id).toBe('feature');
    expect(seeds.findTemplate('feature', 'ux')?.documentType).toBe('ux');
    expect(seeds.findArchetype('nope')).toBeUndefined();
    expect(seeds.findTemplate('feature', 'nope')).toBeUndefined();
  });

  it('describes an empty project with a catalogue of nothing', () => {
    const empty = resolveCatalogue({ documentTypes: [], archetypes: [] });
    expect(empty.archetypes).toEqual([]);
    expect(empty.revision).toMatch(/^[0-9a-f]{64}$/u);
  });
});

describe('canonicalJson', () => {
  it('sorts object keys, keeps array order and drops undefined', () => {
    expect(canonicalJson({ b: [2, 1], a: { d: undefined, c: 1 } })).toBe('{"a":{"c":1},"b":[2,1]}');
  });
});
