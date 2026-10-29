import { Type, type Static } from 'typebox';

import {
  catalogueId,
  DEFINITION_INSTRUCTIONS_MAX_BYTES,
  DEFINITION_SHORT_TEXT_MAX_BYTES,
  DEFINITION_TEMPLATE_MAX_BYTES,
  byteLimitNote,
  iconName,
  instructionsText,
  shortText,
  templateId,
  utf8ByteLength,
} from './definition-schema-parts';

/**
 * Declarative definition schema (`schemaVersion: 1`) of the entities a project's definition files
 * describe (the shape of a resolved catalogue entry). Rules: architecture document "Definitions". Published as
 * JSON Schema through {@link createArchetypeDefinitionsJsonSchema}.
 *
 * Cross-checks that need the whole catalogue (template `documentType` exists, ids unique across
 * entries, `(id, version)` unique) are not expressible per file and belong to the Engine catalogue
 * validation.
 */

// The byte limits are part of the public contract; the schema builders are internal to this package.
export {
  DEFINITION_ICON_MAX_LENGTH,
  DEFINITION_ICON_PATTERN,
  DEFINITION_INSTRUCTIONS_MAX_BYTES,
  DEFINITION_SHORT_TEXT_MAX_BYTES,
  DEFINITION_TEMPLATE_MAX_BYTES,
} from './definition-schema-parts';

export const ARCHETYPE_DEFINITION_SCHEMA_VERSION = 1;
export const ARCHETYPE_DEFINITIONS_SCHEMA_ID = 'urn:nevo:specflow:archetype-definitions:1';
export const JSON_SCHEMA_DRAFT_2020_12 = 'https://json-schema.org/draft/2020-12/schema';

/** Longest document path (and template filename) in characters; the Engine enforces the same bound. */
export const DOCUMENT_PATH_MAX_LENGTH = 500;

export const DocumentTypeDefinitionSchema = Type.Object(
  {
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
export type DocumentTypeDefinition = Static<typeof DocumentTypeDefinitionSchema>;

export const RequirementDefinitionSchema = Type.Object(
  { documentType: catalogueId(), minCount: Type.Integer({ minimum: 0 }) },
  { additionalProperties: false },
);
export type RequirementDefinition = Static<typeof RequirementDefinitionSchema>;

const templateCommon = () => ({
  id: templateId(),
  documentType: catalogueId(),
  filename: Type.String({ minLength: 1, maxLength: DOCUMENT_PATH_MAX_LENGTH }),
  title: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
  instructions: Type.Optional(instructionsText()),
  content: Type.String({
    maxLength: DEFINITION_TEMPLATE_MAX_BYTES,
    description: byteLimitNote(DEFINITION_TEMPLATE_MAX_BYTES),
  }),
});

/** Scaffolded at Create. `preselected` is meaningless here and rejected. */
export const AlwaysTemplateDefinitionSchema = Type.Object(
  { ...templateCommon(), include: Type.Literal('always') },
  { additionalProperties: false },
);

/** A suggestion; `preselected` only sets the default tick in clients. */
export const OptionalTemplateDefinitionSchema = Type.Object(
  {
    ...templateCommon(),
    include: Type.Literal('optional'),
    preselected: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);

export const TemplateDefinitionSchema = Type.Union([
  AlwaysTemplateDefinitionSchema,
  OptionalTemplateDefinitionSchema,
]);
export type TemplateDefinition = Static<typeof TemplateDefinitionSchema>;

export const ArchetypeDefinitionSchema = Type.Object(
  {
    id: catalogueId(),
    version: Type.Integer({ minimum: 1 }),
    title: Type.String({ minLength: 1, maxLength: 200 }),
    description: shortText(),
    useWhen: shortText(),
    /** How to work with the archetype. */
    instructions: Type.Optional(instructionsText()),
    /**
     * The framework invariant: every archetype requires `overview` (`minCount` >= 1) and scaffolds
     * it (an `always` template of document type `overview`). No definition can remove it.
     */
    requirements: Type.Array(RequirementDefinitionSchema, {
      contains: Type.Object({
        documentType: Type.Literal('overview'),
        minCount: Type.Integer({ minimum: 1 }),
      }),
    }),
    templates: Type.Array(TemplateDefinitionSchema, {
      contains: Type.Object({
        documentType: Type.Literal('overview'),
        include: Type.Literal('always'),
      }),
    }),
  },
  { additionalProperties: false },
);
export type ArchetypeDefinition = Static<typeof ArchetypeDefinitionSchema>;

export const ArchetypeDefinitionFileSchema = Type.Object(
  {
    /** Lets editors bind the file to the published JSON Schema. */
    $schema: Type.Optional(Type.String()),
    schemaVersion: Type.Literal(ARCHETYPE_DEFINITION_SCHEMA_VERSION),
    documentTypes: Type.Optional(Type.Array(DocumentTypeDefinitionSchema)),
    archetypes: Type.Optional(Type.Array(ArchetypeDefinitionSchema)),
  },
  { additionalProperties: false },
);
export type ArchetypeDefinitionFile = Static<typeof ArchetypeDefinitionFileSchema>;

export interface DefinitionTextLimitViolation {
  /** JSON-pointer-like location, for example `/archetypes/0/templates/1/content`. */
  readonly path: string;
  readonly limitBytes: number;
  readonly actualBytes: number;
}

/**
 * Exact UTF-8 byte check of the definition text limits (the schema alone only bounds characters).
 * Run on a value that already passed {@link ArchetypeDefinitionFileSchema}.
 */
export function findDefinitionTextLimitViolations(
  file: ArchetypeDefinitionFile,
): DefinitionTextLimitViolation[] {
  const violations: DefinitionTextLimitViolation[] = [];
  const check = (path: string, text: string | undefined, limitBytes: number): void => {
    if (text === undefined) {
      return;
    }

    const actualBytes = utf8ByteLength(text);
    if (actualBytes > limitBytes) {
      violations.push({ path, limitBytes, actualBytes });
    }
  };

  (file.documentTypes ?? []).forEach((type, index) => {
    const base = `/documentTypes/${index}`;
    check(`${base}/description`, type.description, DEFINITION_SHORT_TEXT_MAX_BYTES);
    check(`${base}/useWhen`, type.useWhen, DEFINITION_SHORT_TEXT_MAX_BYTES);
    check(`${base}/instructions`, type.instructions, DEFINITION_INSTRUCTIONS_MAX_BYTES);
  });
  (file.archetypes ?? []).forEach((archetype, index) => {
    const base = `/archetypes/${index}`;
    check(`${base}/description`, archetype.description, DEFINITION_SHORT_TEXT_MAX_BYTES);
    check(`${base}/useWhen`, archetype.useWhen, DEFINITION_SHORT_TEXT_MAX_BYTES);
    check(`${base}/instructions`, archetype.instructions, DEFINITION_INSTRUCTIONS_MAX_BYTES);
    archetype.templates.forEach((template, templateIndex) => {
      const path = `${base}/templates/${templateIndex}`;
      check(`${path}/instructions`, template.instructions, DEFINITION_INSTRUCTIONS_MAX_BYTES);
      check(`${path}/content`, template.content, DEFINITION_TEMPLATE_MAX_BYTES);
    });
  });

  return violations;
}

/**
 * The published JSON Schema (draft 2020-12), derived from the TypeBox definition types. The
 * committed `schema/archetype-definitions.schema.json` is the serialisation of this object
 * (`serializeArchetypeDefinitionsJsonSchema`); a unit test fails on drift.
 */
export function createArchetypeDefinitionsJsonSchema(): Record<string, unknown> {
  return {
    $schema: JSON_SCHEMA_DRAFT_2020_12,
    $id: ARCHETYPE_DEFINITIONS_SCHEMA_ID,
    title: 'Nevo SpecFlow archetype definitions',
    description:
      'Declarative definitions of document types, archetypes, requirements and templates (schemaVersion 1).',
    ...(JSON.parse(JSON.stringify(ArchetypeDefinitionFileSchema)) as Record<string, unknown>),
  };
}

export function serializeArchetypeDefinitionsJsonSchema(): string {
  return `${JSON.stringify(createArchetypeDefinitionsJsonSchema(), null, 2)}\n`;
}
