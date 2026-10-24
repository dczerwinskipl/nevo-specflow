import {
  ArchetypeDefinitionFileSchema,
  type ArchetypeDefinitionFile,
} from '@nevo/specflow-contracts/documents';
import { Value } from 'typebox/value';
import { describe, expect, it } from 'vitest';

import { BUILT_IN_DEFINITIONS } from './builtins';
import {
  CatalogueDefinitionError,
  catalogueRevision,
  findCatalogueIssues,
  getBuiltInCatalogue,
  resolveCatalogue,
} from './catalogue';

const catalogue = getBuiltInCatalogue();

function clone(): ArchetypeDefinitionFile {
  return structuredClone<ArchetypeDefinitionFile>(BUILT_IN_DEFINITIONS);
}

describe('built-in catalogue invariants', () => {
  it('conforms to the definition schema and byte limits', () => {
    expect([...Value.Errors(ArchetypeDefinitionFileSchema, BUILT_IN_DEFINITIONS)]).toEqual([]);
    expect(findCatalogueIssues(BUILT_IN_DEFINITIONS)).toEqual([]);
  });

  it('contains the three archetypes and nine document types', () => {
    expect(catalogue.archetypes.map((a) => [a.id, a.version])).toEqual([
      ['minimal', 1],
      ['feature', 1],
      ['architecture', 1],
    ]);
    expect(catalogue.documentTypes.map((t) => t.id)).toEqual([
      'overview',
      'behaviour',
      'ux',
      'backend',
      'architecture',
      'decisions',
      'research',
      'user-story',
      'note',
    ]);
  });

  it('requires only overview in every archetype and scaffolds an always overview', () => {
    for (const archetype of catalogue.archetypes) {
      expect(archetype.requirements).toEqual([{ documentType: 'overview', minCount: 1 }]);
      const always = archetype.templates.filter((t) => t.include === 'always');
      expect(always).toHaveLength(1);
      expect(always[0]).toMatchObject({
        id: 'overview',
        documentType: 'overview',
        filename: 'overview.md',
      });
      expect(archetype.templates[0]?.id).toBe('overview');
    }
  });

  it('references only existing document types and has unique ids', () => {
    const typeIds = new Set(catalogue.documentTypes.map((t) => t.id));
    expect(typeIds.size).toBe(catalogue.documentTypes.length);
    expect(new Set(catalogue.archetypes.map((a) => a.id)).size).toBe(catalogue.archetypes.length);
    for (const archetype of catalogue.archetypes) {
      expect(new Set(archetype.templates.map((t) => t.id)).size).toBe(archetype.templates.length);
      for (const requirement of archetype.requirements) {
        expect(typeIds.has(requirement.documentType)).toBe(true);
      }
      for (const template of archetype.templates) {
        expect(typeIds.has(template.documentType)).toBe(true);
      }
    }
  });

  it('gives every document type non-empty instructions, description and useWhen', () => {
    for (const type of catalogue.documentTypes) {
      expect(type.instructions.trim()).not.toBe('');
      expect(type.description.trim()).not.toBe('');
      expect(type.useWhen.trim()).not.toBe('');
    }
    for (const archetype of catalogue.archetypes) {
      expect(archetype.description.trim()).not.toBe('');
      expect(archetype.useWhen.trim()).not.toBe('');
    }
  });

  it('is immutable', () => {
    expect(Object.isFrozen(catalogue.archetypes)).toBe(true);
    expect(Object.isFrozen(catalogue.archetypes[0]?.templates[0])).toBe(true);
  });

  it('offers lookups', () => {
    expect(catalogue.findArchetype('feature')?.title).toBe('Feature');
    expect(catalogue.findArchetype('nope')).toBeUndefined();
    expect(catalogue.findDocumentType('ux')?.defaultFilename).toBe('ux.md');
    expect(catalogue.findTemplate('feature', 'backend')?.documentType).toBe('backend');
    expect(catalogue.findTemplate('minimal', 'backend')).toBeUndefined();
  });
});

describe('catalogue-wide checks the schema cannot express', () => {
  function issuesOf(edit: (file: ArchetypeDefinitionFile) => void): string[] {
    const file = clone();
    edit(file);
    return findCatalogueIssues(file);
  }

  it('rejects a requirement of an unknown document type', () => {
    expect(
      issuesOf((f) => f.archetypes![0]!.requirements.push({ documentType: 'ghost', minCount: 1 })),
    ).toEqual([expect.stringContaining('unknown document type "ghost"')]);
  });

  it('rejects a template of an unknown document type', () => {
    expect(
      issuesOf((f) => {
        f.archetypes![0]!.templates[1]!.documentType = 'ghost';
      }),
    ).toEqual([expect.stringContaining('unknown document type "ghost"')]);
  });

  it('rejects duplicate document type ids, archetype ids and template ids', () => {
    expect(issuesOf((f) => void f.documentTypes!.push({ ...f.documentTypes![0]! }))).toEqual([
      expect.stringContaining('duplicate document type id "overview"'),
    ]);
    expect(issuesOf((f) => void f.archetypes!.push({ ...f.archetypes![0]!, version: 2 }))).toEqual([
      expect.stringContaining('duplicate archetype id "minimal"'),
    ]);
    expect(
      issuesOf((f) => {
        f.archetypes![0]!.templates[2]!.id = 'decisions';
      }),
    ).toEqual(
      expect.arrayContaining([expect.stringContaining('duplicate template id "decisions"')]),
    );
  });

  it('rejects duplicate requirement document types per archetype', () => {
    expect(
      issuesOf((f) =>
        f.archetypes![0]!.requirements.push({ documentType: 'overview', minCount: 2 }),
      ),
    ).toEqual([expect.stringContaining('more than once')]);
  });

  it('rejects template ids that start with u-', () => {
    expect(
      issuesOf((f) => {
        f.archetypes![0]!.templates[1]!.id = 'u-note';
      }),
    ).toEqual([expect.stringContaining('reserved "u-" space')]);
  });

  it('rejects document types in the reserved u- space', () => {
    expect(
      issuesOf((f) =>
        f.documentTypes!.push({ ...f.documentTypes![8]!, id: 'u-extra', defaultFilename: 'e.md' }),
      ),
    ).toEqual([expect.stringContaining('reserved "u-" space')]);
  });

  it.each([
    ['id', (t: { id: string }) => void (t.id = 'not-overview')],
    ['documentType', (t: { documentType: string }) => void (t.documentType = 'note')],
    ['filename', (t: { filename: string }) => void (t.filename = 'main.md')],
  ])('requires the overview template to keep its fixed %s', (_name, edit) => {
    const file = clone();
    edit(file.archetypes![0]!.templates[0]!);
    expect(findCatalogueIssues(file)).not.toEqual([]);
  });

  it('rejects an invalid template filename and case-insensitive filename clashes', () => {
    expect(
      issuesOf((f) => {
        f.archetypes![0]!.templates[1]!.filename = '../x.md';
      }),
    ).toEqual([expect.stringContaining('invalid filename')]);
    expect(
      issuesOf((f) => {
        f.archetypes![0]!.templates[1]!.filename = 'Overview.MD';
      }),
    ).toEqual([expect.stringContaining('same filename ignoring case')]);
  });

  it('rejects text above the exact UTF-8 byte limit that fits the character limit', () => {
    const issues = issuesOf((f) => {
      f.documentTypes![0]!.useWhen = 'ż'.repeat(600); // 600 characters, 1200 bytes
    });
    expect(issues).toEqual([expect.stringContaining('above the 1000 byte limit')]);
  });

  it('rejects schema violations before running the cross-checks', () => {
    const file = clone();
    delete (file.documentTypes![0] as { instructions?: string }).instructions;
    expect(findCatalogueIssues(file)[0]).toMatch(/^schema /u);
  });

  it('rejects a missing overview document type', () => {
    expect(
      issuesOf((f) => {
        f.documentTypes = f.documentTypes!.filter((t) => t.id !== 'overview');
      }),
    ).toEqual(expect.arrayContaining(['document type "overview" is missing']));
  });

  it('throws every issue from resolveCatalogue and rejects duplicates between built-ins and user definitions', () => {
    const user: ArchetypeDefinitionFile = {
      schemaVersion: 1,
      archetypes: [{ ...clone().archetypes![0]! }],
    };
    expect(() => resolveCatalogue(BUILT_IN_DEFINITIONS, user)).toThrow(CatalogueDefinitionError);
  });

  it('merges valid user definitions', () => {
    const user: ArchetypeDefinitionFile = {
      schemaVersion: 1,
      documentTypes: [
        {
          id: 'runbook',
          title: 'Runbook',
          description: 'Operational steps.',
          useWhen: 'Operators run it.',
          instructions: 'List steps.',
          defaultFilename: 'runbook.md',
        },
      ],
      archetypes: [
        {
          id: 'ops',
          version: 1,
          title: 'Ops',
          description: 'Ops change.',
          useWhen: 'Operations.',
          requirements: [
            { documentType: 'overview', minCount: 1 },
            { documentType: 'runbook', minCount: 1 },
          ],
          templates: [
            { ...clone().archetypes![0]!.templates[0]! },
            {
              id: 'runbook',
              documentType: 'runbook',
              filename: 'runbook.md',
              include: 'optional',
              content: '# {{specificationTitle}}\n',
            },
          ],
        },
      ],
    };
    const merged = resolveCatalogue(BUILT_IN_DEFINITIONS, user);
    expect(merged.findArchetype('ops')?.requirements).toHaveLength(2);
    expect(merged.revision).not.toBe(catalogueRevision());
  });
});
