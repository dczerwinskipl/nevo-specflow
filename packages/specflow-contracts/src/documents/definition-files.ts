import { Type, type Static } from 'typebox';

import { DOCUMENT_PATH_MAX_LENGTH, JSON_SCHEMA_DRAFT_2020_12 } from './definition';
import {
  DEFINITION_INSTRUCTIONS_MAX_BYTES,
  DEFINITION_SHORT_TEXT_MAX_BYTES,
  DEFINITION_TEMPLATE_MAX_BYTES,
  byteLimitNote,
  catalogueId,
  iconName,
  instructionsText,
  shortText,
  templateId,
  utf8ByteLength,
} from './definition-schema-parts';

/**
 * Per-kind definition files (`.nevo/definitions/<kind>/<id>.yaml`). One file defines one entity;
 * each kind has its own schema and `schemaVersion`. A file carries no origin, version stamp or
 * hash. Rules: `docs/reference/api/specification-documents.md` ("Definition files").
 *
 * Cross-file checks (references between files, framework requirements such as `overview`, id
 * against file name, `kind` against directory) belong to the Engine loader and are reported as
 * `DefinitionProblem`s, not as schema violations.
 */

export const DEFINITION_FILE_SCHEMA_VERSION = 1;

/** The kinds the product ships today. The Engine kind registry is open for more. */
export const DEFINITION_KINDS = ['document-type', 'specification-archetype'] as const;
export type DefinitionKind = (typeof DEFINITION_KINDS)[number];

/** `$id` of the published JSON Schema of one kind and schema version. */
export function definitionSchemaId(kind: DefinitionKind, schemaVersion: number): string {
  return `urn:nevo:specflow:definition:${kind}:${schemaVersion}`;
}

/**
 * `contentFile` of a template: relative to the kind directory, below `templates/`, at most eight
 * segments of `[A-Za-z0-9._-]`, no `.` or `..` segment.
 */
export const DEFINITION_CONTENT_FILE_PATTERN =
  '^templates/(?!\\.{1,2}(?:/|$))[A-Za-z0-9._-]+(?:/(?!\\.{1,2}(?:/|$))[A-Za-z0-9._-]+){0,7}$';

const fileHeader = <TKind extends DefinitionKind>(kind: TKind) => ({
  /** Lets editors bind the file to the published JSON Schema. */
  $schema: Type.Optional(Type.String()),
  kind: Type.Literal(kind),
  schemaVersion: Type.Literal(DEFINITION_FILE_SCHEMA_VERSION),
});

export const DocumentTypeDefinitionFileSchema = Type.Object(
  {
    ...fileHeader('document-type'),
    id: catalogueId(),
    title: Type.String({ minLength: 1, maxLength: 200 }),
    description: shortText(),
    useWhen: shortText(),
    /** How to prepare the document and what it must contain. Not stored in a Specification. */
    instructions: instructionsText(),
    defaultFilename: Type.Optional(
      Type.String({ minLength: 1, maxLength: DOCUMENT_PATH_MAX_LENGTH }),
    ),
    /** Optional icon of the type in the document tree (a Design System icon name). */
    icon: Type.Optional(iconName()),
  },
  { additionalProperties: false },
);
export type DocumentTypeDefinitionFile = Static<typeof DocumentTypeDefinitionFileSchema>;

const templateCommon = () => ({
  id: templateId(),
  documentType: catalogueId(),
  filename: Type.String({ minLength: 1, maxLength: DOCUMENT_PATH_MAX_LENGTH }),
  title: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
  instructions: Type.Optional(instructionsText()),
});

const inlineContent = () => ({
  content: Type.String({
    maxLength: DEFINITION_TEMPLATE_MAX_BYTES,
    description: byteLimitNote(DEFINITION_TEMPLATE_MAX_BYTES),
  }),
});

const contentFile = () => ({
  contentFile: Type.String({ pattern: DEFINITION_CONTENT_FILE_PATTERN }),
});

const always = () => ({ include: Type.Literal('always') });
const optional = () => ({
  include: Type.Literal('optional'),
  preselected: Type.Optional(Type.Boolean()),
});

/**
 * A template has exactly one of `content` and `contentFile`; an `always` template may not set
 * `preselected`. Expressed as four closed variants so neither combination can be both or neither.
 */
export const ArchetypeTemplateFileEntrySchema = Type.Union([
  Type.Object(
    { ...templateCommon(), ...always(), ...inlineContent() },
    { additionalProperties: false },
  ),
  Type.Object(
    { ...templateCommon(), ...always(), ...contentFile() },
    { additionalProperties: false },
  ),
  Type.Object(
    { ...templateCommon(), ...optional(), ...inlineContent() },
    { additionalProperties: false },
  ),
  Type.Object(
    { ...templateCommon(), ...optional(), ...contentFile() },
    { additionalProperties: false },
  ),
]);
export type ArchetypeTemplateFileEntry = Static<typeof ArchetypeTemplateFileEntrySchema>;

export const ArchetypeRequirementFileEntrySchema = Type.Object(
  { documentType: catalogueId(), minCount: Type.Integer({ minimum: 0 }) },
  { additionalProperties: false },
);

export const SpecificationArchetypeDefinitionFileSchema = Type.Object(
  {
    ...fileHeader('specification-archetype'),
    id: catalogueId(),
    version: Type.Integer({ minimum: 1 }),
    title: Type.String({ minLength: 1, maxLength: 200 }),
    description: shortText(),
    useWhen: shortText(),
    /** How to work with the archetype. */
    instructions: Type.Optional(instructionsText()),
    requirements: Type.Array(ArchetypeRequirementFileEntrySchema),
    templates: Type.Array(ArchetypeTemplateFileEntrySchema),
  },
  { additionalProperties: false },
);
export type SpecificationArchetypeDefinitionFile = Static<
  typeof SpecificationArchetypeDefinitionFileSchema
>;

export interface DefinitionFileTextLimitViolation {
  /** JSON pointer inside the file, for example `/templates/1/content`. */
  readonly path: string;
  readonly limitBytes: number;
  readonly actualBytes: number;
}

function checkLimit(
  violations: DefinitionFileTextLimitViolation[],
  path: string,
  text: string | undefined,
  limitBytes: number,
): void {
  if (text === undefined) {
    return;
  }

  const actualBytes = utf8ByteLength(text);
  if (actualBytes > limitBytes) {
    violations.push({ path, limitBytes, actualBytes });
  }
}

/**
 * Exact UTF-8 byte check of one document-type file (the schema alone only bounds characters).
 * Run on a value that already passed {@link DocumentTypeDefinitionFileSchema}.
 */
export function findDocumentTypeFileLimitViolations(
  file: DocumentTypeDefinitionFile,
): DefinitionFileTextLimitViolation[] {
  const violations: DefinitionFileTextLimitViolation[] = [];
  checkLimit(violations, '/description', file.description, DEFINITION_SHORT_TEXT_MAX_BYTES);
  checkLimit(violations, '/useWhen', file.useWhen, DEFINITION_SHORT_TEXT_MAX_BYTES);
  checkLimit(violations, '/instructions', file.instructions, DEFINITION_INSTRUCTIONS_MAX_BYTES);

  return violations;
}

/**
 * Exact UTF-8 byte check of one archetype file. Only inline `content` is checked here; the bytes
 * of a `contentFile` are measured by the Engine when it reads the file.
 */
export function findArchetypeFileLimitViolations(
  file: SpecificationArchetypeDefinitionFile,
): DefinitionFileTextLimitViolation[] {
  const violations: DefinitionFileTextLimitViolation[] = [];
  checkLimit(violations, '/description', file.description, DEFINITION_SHORT_TEXT_MAX_BYTES);
  checkLimit(violations, '/useWhen', file.useWhen, DEFINITION_SHORT_TEXT_MAX_BYTES);
  checkLimit(violations, '/instructions', file.instructions, DEFINITION_INSTRUCTIONS_MAX_BYTES);
  file.templates.forEach((template, index) => {
    const base = `/templates/${index}`;
    checkLimit(
      violations,
      `${base}/instructions`,
      template.instructions,
      DEFINITION_INSTRUCTIONS_MAX_BYTES,
    );
    if ('content' in template) {
      checkLimit(violations, `${base}/content`, template.content, DEFINITION_TEMPLATE_MAX_BYTES);
    }
  });

  return violations;
}

const DEFINITION_FILE_SCHEMAS = {
  'document-type': {
    title: 'Nevo SpecFlow document type definition',
    description: 'One document type (kind document-type, schemaVersion 1).',
    schema: DocumentTypeDefinitionFileSchema,
  },
  'specification-archetype': {
    title: 'Nevo SpecFlow specification archetype definition',
    description:
      'One Specification archetype with its requirements and templates (kind specification-archetype, schemaVersion 1).',
    schema: SpecificationArchetypeDefinitionFileSchema,
  },
} as const satisfies Record<DefinitionKind, unknown>;

/** Committed file name of the published JSON Schema of one kind, for example `document-type.v1.schema.json`. */
export function definitionJsonSchemaFileName(
  kind: DefinitionKind,
  schemaVersion = DEFINITION_FILE_SCHEMA_VERSION,
): string {
  return `${kind}.v${schemaVersion}.schema.json`;
}

/**
 * The published JSON Schema (draft 2020-12) of one kind, derived from the TypeBox type. The
 * committed `schema/definitions/<kind>.v1.schema.json` is the serialisation of this object.
 */
export function createDefinitionJsonSchema(kind: DefinitionKind): Record<string, unknown> {
  const entry = DEFINITION_FILE_SCHEMAS[kind];

  return {
    $schema: JSON_SCHEMA_DRAFT_2020_12,
    $id: definitionSchemaId(kind, DEFINITION_FILE_SCHEMA_VERSION),
    title: entry.title,
    description: entry.description,
    ...(JSON.parse(JSON.stringify(entry.schema)) as Record<string, unknown>),
  };
}

export function serializeDefinitionJsonSchema(kind: DefinitionKind): string {
  return `${JSON.stringify(createDefinitionJsonSchema(kind), null, 2)}\n`;
}
