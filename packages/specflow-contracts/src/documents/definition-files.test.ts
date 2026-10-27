import { Compile } from 'typebox/compile';
import { Value } from 'typebox/value';
import { describe, expect, it } from 'vitest';

import documentTypeSchema from '../../schema/definitions/document-type.v1.schema.json';
import documentTypeSchemaText from '../../schema/definitions/document-type.v1.schema.json?raw';
import archetypeSchema from '../../schema/definitions/specification-archetype.v1.schema.json';
import archetypeSchemaText from '../../schema/definitions/specification-archetype.v1.schema.json?raw';
import {
  DEFINITION_KINDS,
  DocumentTypeDefinitionFileSchema,
  SpecificationArchetypeDefinitionFileSchema,
  createDefinitionJsonSchema,
  definitionSchemaId,
  findArchetypeFileLimitViolations,
  findDocumentTypeFileLimitViolations,
  serializeDefinitionJsonSchema,
  type DocumentTypeDefinitionFile,
  type SpecificationArchetypeDefinitionFile,
} from './definition-files';
import { DEFINITION_SHORT_TEXT_MAX_BYTES, DEFINITION_TEMPLATE_MAX_BYTES } from './definition';

/** The examples of `docs/reference/api/specification-documents.md` ("Definition files"). */
const documentType = (): DocumentTypeDefinitionFile => ({
  kind: 'document-type',
  schemaVersion: 1,
  id: 'runbook',
  title: 'Runbook',
  description: 'Operational steps for running or recovering a system.',
  useWhen: 'The change adds something that operators must run or recover.',
  instructions: 'List preconditions, numbered steps and the expected result of each step.',
  defaultFilename: 'runbook.md',
});

const archetype = (): SpecificationArchetypeDefinitionFile => ({
  kind: 'specification-archetype',
  schemaVersion: 1,
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
      contentFile: 'templates/overview.md',
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
});

type Json = Record<string, unknown>;
const withTemplate = (template: Json): Json => ({ ...archetype(), templates: [template] });
const overviewTemplate = {
  id: 'overview',
  documentType: 'overview',
  filename: 'overview.md',
  include: 'always',
};

const invalidDocumentTypes: [string, () => Json][] = [
  ['a wrong kind', () => ({ ...documentType(), kind: 'specification-archetype' })],
  ['a missing kind', () => ({ ...documentType(), kind: undefined })],
  ['an unknown key', () => ({ ...documentType(), extra: 1 })],
  ['an origin key', () => ({ ...documentType(), origin: 'seed' })],
  ['an id over 32 characters', () => ({ ...documentType(), id: `a${'b'.repeat(32)}` })],
  ['an unsupported schemaVersion', () => ({ ...documentType(), schemaVersion: 2 })],
  ['an empty description', () => ({ ...documentType(), description: '' })],
];

const invalidArchetypes: [string, () => Json][] = [
  ['a wrong kind', () => ({ ...archetype(), kind: 'document-type' })],
  ['an unknown key', () => ({ ...archetype(), extra: 1 })],
  ['an origin key', () => ({ ...archetype(), origin: 'seed' })],
  ['an id over 32 characters', () => ({ ...archetype(), id: `a${'b'.repeat(32)}` })],
  [
    'a template with both content and contentFile',
    () => withTemplate({ ...overviewTemplate, content: 'x', contentFile: 'templates/a.md' }),
  ],
  ['a template with neither content nor contentFile', () => withTemplate(overviewTemplate)],
  [
    'a contentFile that traverses upwards',
    () => withTemplate({ ...overviewTemplate, contentFile: 'templates/../secret.md' }),
  ],
  [
    'a contentFile that ends in a parent segment',
    () => withTemplate({ ...overviewTemplate, contentFile: 'templates/a/..' }),
  ],
  [
    'a contentFile outside the templates folder',
    () => withTemplate({ ...overviewTemplate, contentFile: 'other/a.md' }),
  ],
  [
    'an absolute contentFile',
    () => withTemplate({ ...overviewTemplate, contentFile: '/templates/a.md' }),
  ],
  [
    'a contentFile nested deeper than eight segments',
    () =>
      withTemplate({
        ...overviewTemplate,
        contentFile: `templates/${Array.from({ length: 9 }, () => 'a').join('/')}`,
      }),
  ],
  [
    'preselected on an always template',
    () => withTemplate({ ...overviewTemplate, content: 'x', preselected: true }),
  ],
  [
    'an include outside the vocabulary',
    () => withTemplate({ ...overviewTemplate, include: 'sometimes', content: 'x' }),
  ],
  [
    'a requirement with a negative minCount',
    () => ({ ...archetype(), requirements: [{ documentType: 'overview', minCount: -1 }] }),
  ],
];

const CASES = [
  {
    kind: 'document-type',
    schema: DocumentTypeDefinitionFileSchema,
    valid: () => documentType() as Json,
    invalid: invalidDocumentTypes,
    committed: documentTypeSchema,
    committedText: documentTypeSchemaText,
  },
  {
    kind: 'specification-archetype',
    schema: SpecificationArchetypeDefinitionFileSchema,
    valid: () => archetype() as Json,
    invalid: invalidArchetypes,
    committed: archetypeSchema,
    committedText: archetypeSchemaText,
  },
] as const;

describe('per-kind definition files', () => {
  it('registers exactly the kinds that have a case here', () => {
    expect([...DEFINITION_KINDS]).toEqual(CASES.map((entry) => entry.kind));
  });

  it('accepts the reference examples, an optional-only archetype and $schema', () => {
    expect(Value.Check(DocumentTypeDefinitionFileSchema, documentType())).toBe(true);
    expect(Value.Check(SpecificationArchetypeDefinitionFileSchema, archetype())).toBe(true);
    expect(
      Value.Check(DocumentTypeDefinitionFileSchema, {
        ...documentType(),
        $schema: './document-type.v1.schema.json',
      }),
    ).toBe(true);
    expect(
      Value.Check(SpecificationArchetypeDefinitionFileSchema, {
        ...archetype(),
        templates: [{ ...archetype().templates[1], include: 'optional', content: 'x' }],
      }),
    ).toBe(true);
  });

  it('keeps cross-file rules out of the per-file schema', () => {
    // The overview requirement and template are reported by the Engine as definition problems.
    expect(
      Value.Check(SpecificationArchetypeDefinitionFileSchema, {
        ...archetype(),
        requirements: [],
        templates: [],
      }),
    ).toBe(true);
  });

  describe.each(CASES)('$kind', ({ kind, schema, valid, invalid, committed, committedText }) => {
    const compiled = Compile(schema);

    it.each(invalid)('rejects %s', (_name, build) => {
      expect(Value.Check(schema, build())).toBe(false);
    });

    it('publishes a JSON Schema equal to the committed file (no drift)', () => {
      expect(committed.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
      expect(committed.$id).toBe(definitionSchemaId(kind, 1));
      expect(JSON.stringify(committed)).toBe(JSON.stringify(createDefinitionJsonSchema(kind)));
      // Byte equality: the committed file is exactly the generator output (prettier ignores it).
      expect(committedText).toBe(serializeDefinitionJsonSchema(kind));
    });

    it('validates the example and rejects the same cases through the published schema', () => {
      expect(compiled.Check(valid())).toBe(true);
      for (const [, build] of invalid) expect(compiled.Check(build())).toBe(false);
    });
  });

  describe('byte limits', () => {
    it('reports text within the character limit but above the byte limit', () => {
      const file = documentType();
      file.description = 'ą'.repeat(DEFINITION_SHORT_TEXT_MAX_BYTES / 2 + 1);
      expect(Value.Check(DocumentTypeDefinitionFileSchema, file)).toBe(true);
      expect(findDocumentTypeFileLimitViolations(file)).toEqual([
        {
          path: '/description',
          limitBytes: DEFINITION_SHORT_TEXT_MAX_BYTES,
          actualBytes: (DEFINITION_SHORT_TEXT_MAX_BYTES / 2 + 1) * 2,
        },
      ]);
      expect(findDocumentTypeFileLimitViolations(documentType())).toEqual([]);
    });

    it('checks inline template content and ignores a contentFile reference', () => {
      const file = archetype();
      file.templates[1] = {
        ...file.templates[1]!,
        content: 'ą'.repeat(DEFINITION_TEMPLATE_MAX_BYTES / 2 + 1),
      };
      expect(findArchetypeFileLimitViolations(file)).toEqual([
        {
          path: '/templates/1/content',
          limitBytes: DEFINITION_TEMPLATE_MAX_BYTES,
          actualBytes: (DEFINITION_TEMPLATE_MAX_BYTES / 2 + 1) * 2,
        },
      ]);
      expect(findArchetypeFileLimitViolations(archetype())).toEqual([]);
    });
  });
});
