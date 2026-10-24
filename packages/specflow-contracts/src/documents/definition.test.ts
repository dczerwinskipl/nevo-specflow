import { Compile } from 'typebox/compile';
import { Value } from 'typebox/value';
import { describe, expect, it } from 'vitest';

import committedSchema from '../../schema/archetype-definitions.schema.json';
import committedSchemaText from '../../schema/archetype-definitions.schema.json?raw';
import {
  ARCHETYPE_DEFINITIONS_SCHEMA_ID,
  ArchetypeDefinitionFileSchema,
  createArchetypeDefinitionsJsonSchema,
  DEFINITION_SHORT_TEXT_MAX_BYTES,
  findDefinitionTextLimitViolations,
  serializeArchetypeDefinitionsJsonSchema,
  type ArchetypeDefinitionFile,
} from './definition';

/** The example file of `docs/reference/api/specification-documents.md` ("Definition schema"). */
function referenceExample(): ArchetypeDefinitionFile {
  return {
    schemaVersion: 1,
    documentTypes: [
      {
        id: 'runbook',
        title: 'Runbook',
        description: 'Operational steps for running or recovering a system.',
        useWhen: 'The change adds something that operators must run or recover.',
        instructions: 'List preconditions, numbered steps and the expected result of each step.',
        defaultFilename: 'runbook.md',
      },
    ],
    archetypes: [
      {
        id: 'operations-change',
        version: 1,
        title: 'Operations change',
        description: 'A change with an operational impact.',
        useWhen: 'The work changes how a system is operated.',
        requirements: [{ documentType: 'overview', minCount: 1 }],
        templates: [
          {
            id: 'overview',
            documentType: 'overview',
            filename: 'overview.md',
            include: 'always',
            content: '# {{specificationTitle}}\n',
          },
          {
            id: 'runbook',
            documentType: 'runbook',
            filename: 'runbook.md',
            include: 'optional',
            preselected: true,
            content: '# {{specificationTitle}} - Runbook\n',
          },
        ],
      },
    ],
  };
}

type Json = Record<string, unknown>;
type Case = readonly [name: string, build: () => unknown];

function omit(value: object, key: string): Json {
  const copy: Json = { ...value };
  delete copy[key];
  return copy;
}

const example = referenceExample();
const archetype = example.archetypes![0]!;
const [overviewTemplate, runbookTemplate] = archetype.templates as unknown as [Json, Json];

function withDocumentType(replacement: Json): Json {
  return { ...example, documentTypes: [{ ...example.documentTypes![0], ...replacement }] };
}
function withoutDocumentTypeKey(key: string): Json {
  return { ...example, documentTypes: [omit(example.documentTypes![0]!, key)] };
}
function withArchetype(replacement: Json): Json {
  return { ...example, archetypes: [{ ...archetype, ...replacement }] };
}
function withoutArchetypeKey(key: string): Json {
  return { ...example, archetypes: [omit(archetype, key)] };
}

const invalidCases: readonly Case[] = [
  ['a document type without instructions', () => withoutDocumentTypeKey('instructions')],
  ['a document type without description', () => withoutDocumentTypeKey('description')],
  ['an archetype without useWhen', () => withoutArchetypeKey('useWhen')],
  ['an archetype without description', () => withoutArchetypeKey('description')],
  [
    'a template without documentType',
    () => withArchetype({ templates: [overviewTemplate, omit(runbookTemplate, 'documentType')] }),
  ],
  [
    'preselected on an always template',
    () =>
      withArchetype({ templates: [{ ...overviewTemplate, preselected: true }, runbookTemplate] }),
  ],
  [
    'a negative minCount',
    () => withArchetype({ requirements: [{ documentType: 'overview', minCount: -1 }] }),
  ],
  ['a zero archetype version', () => withArchetype({ version: 0 })],
  ['a string archetype version', () => withArchetype({ version: '1' })],
  ['an unknown top-level key', () => ({ ...example, extra: true })],
  ['an unknown archetype key', () => withArchetype({ required: true })],
  [
    'an unknown template key',
    () => withArchetype({ templates: [overviewTemplate, { ...runbookTemplate, required: true }] }),
  ],
  ['an unknown document type key', () => withDocumentType({ alias: 'rb' })],
  ['an unknown schemaVersion', () => ({ ...example, schemaVersion: 2 })],
  [
    'an invalid template include',
    () =>
      withArchetype({ templates: [overviewTemplate, { ...runbookTemplate, include: 'maybe' }] }),
  ],
  ['an invalid archetype id', () => withArchetype({ id: 'Operations_Change' })],
  [
    'an archetype that does not require overview',
    () => withArchetype({ requirements: [{ documentType: 'runbook', minCount: 1 }] }),
  ],
  [
    'an archetype that requires overview with minCount 0',
    () => withArchetype({ requirements: [{ documentType: 'overview', minCount: 0 }] }),
  ],
  [
    'an archetype without an always overview template',
    () => withArchetype({ templates: [runbookTemplate] }),
  ],
  [
    'an overview template that is only optional',
    () =>
      withArchetype({ templates: [{ ...overviewTemplate, include: 'optional' }, runbookTemplate] }),
  ],
  ['an archetype id with a leading digit', () => withArchetype({ id: '1abc' })],
  [
    'a template id that breaks the id pattern',
    () => withArchetype({ templates: [{ ...overviewTemplate, id: 'Overview' }, runbookTemplate] }),
  ],
  [
    'a description longer than the limit in characters',
    () => withDocumentType({ description: 'x'.repeat(DEFINITION_SHORT_TEXT_MAX_BYTES + 1) }),
  ],
];

describe('archetype definition schema', () => {
  const compiled = Compile(committedSchema);

  it('accepts the reference example and an optional-only file', () => {
    expect(Value.Check(ArchetypeDefinitionFileSchema, referenceExample())).toBe(true);
    expect(Value.Check(ArchetypeDefinitionFileSchema, { schemaVersion: 1 })).toBe(true);
    expect(
      Value.Check(ArchetypeDefinitionFileSchema, {
        schemaVersion: 1,
        $schema: './archetype-definitions.schema.json',
        documentTypes: referenceExample().documentTypes,
      }),
    ).toBe(true);
  });

  it.each(invalidCases)('rejects %s', (_name, build) => {
    const file = build();
    expect(Value.Check(ArchetypeDefinitionFileSchema, file)).toBe(false);
  });

  describe('published JSON Schema', () => {
    it('declares the draft, the id and equals the generated schema (no drift)', () => {
      expect(committedSchema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
      expect(committedSchema.$id).toBe(ARCHETYPE_DEFINITIONS_SCHEMA_ID);
      expect(JSON.stringify(committedSchema)).toBe(
        JSON.stringify(createArchetypeDefinitionsJsonSchema()),
      );
      // Byte equality: the committed file is exactly the generator output (prettier ignores it).
      expect(committedSchemaText).toBe(serializeArchetypeDefinitionsJsonSchema());
    });

    it('validates the reference example on its own', () => {
      expect(compiled.Check(referenceExample())).toBe(true);
    });

    it.each(invalidCases)('rejects %s on its own', (_name, build) => {
      const file = build();
      expect(compiled.Check(file)).toBe(false);
    });
  });

  describe('byte limits', () => {
    it('reports text that is within the character limit but above the byte limit', () => {
      const file = referenceExample();
      file.documentTypes![0]!.description = 'ą'.repeat(DEFINITION_SHORT_TEXT_MAX_BYTES / 2 + 1);
      expect(Value.Check(ArchetypeDefinitionFileSchema, file)).toBe(true);
      expect(findDefinitionTextLimitViolations(file)).toEqual([
        {
          path: '/documentTypes/0/description',
          limitBytes: DEFINITION_SHORT_TEXT_MAX_BYTES,
          actualBytes: (DEFINITION_SHORT_TEXT_MAX_BYTES / 2 + 1) * 2,
        },
      ]);
    });

    it('reports nothing for the reference example', () => {
      expect(findDefinitionTextLimitViolations(referenceExample())).toEqual([]);
    });
  });
});
