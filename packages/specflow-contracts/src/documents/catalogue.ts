import { Type, type Static } from 'typebox';

import { CatalogueIdSchema, RegisteredDocumentIdSchema, closedUnion } from './vocabulary';

/** `include` of a template: `always` is scaffolded at Create, `optional` is a suggestion. */
export const TEMPLATE_INCLUDES = ['always', 'optional'] as const;
export const TemplateIncludeSchema = closedUnion(TEMPLATE_INCLUDES);
export type TemplateInclude = (typeof TEMPLATE_INCLUDES)[number];

/** All text mandatory except `defaultFilename`. */
export const DocumentTypeInfoSchema = Type.Object(
  {
    id: CatalogueIdSchema,
    title: Type.String({ minLength: 1 }),
    description: Type.String({ minLength: 1 }),
    useWhen: Type.String({ minLength: 1 }),
    instructions: Type.String({ minLength: 1 }),
    defaultFilename: Type.Optional(Type.String({ minLength: 1 })),
  },
  { additionalProperties: false },
);
export type DocumentTypeInfo = Static<typeof DocumentTypeInfoSchema>;

export const ArchetypeRequirementSchema = Type.Object(
  { documentType: CatalogueIdSchema, minCount: Type.Integer({ minimum: 0 }) },
  { additionalProperties: false },
);
export type ArchetypeRequirement = Static<typeof ArchetypeRequirementSchema>;

export const ArchetypeTemplateInfoSchema = Type.Object(
  {
    id: RegisteredDocumentIdSchema,
    type: CatalogueIdSchema,
    title: Type.String({ minLength: 1 }),
    filename: Type.String({ minLength: 1 }),
    include: TemplateIncludeSchema,
    preselected: Type.Optional(Type.Boolean()),
    instructions: Type.Optional(Type.String()),
    content: Type.String(),
  },
  { additionalProperties: false },
);
export type ArchetypeTemplateInfo = Static<typeof ArchetypeTemplateInfoSchema>;

/** Demo-only; the real backend omits it. */
export const ArchetypeWorkflowSchema = Type.Object(
  {
    phases: Type.Array(Type.String()),
    requiredDocuments: Type.Array(Type.String()),
    suggestedDocuments: Type.Array(Type.String()),
  },
  { additionalProperties: false },
);

export const ArchetypeInfoSchema = Type.Object(
  {
    id: CatalogueIdSchema,
    version: Type.Integer({ minimum: 1 }),
    title: Type.String({ minLength: 1 }),
    description: Type.String({ minLength: 1 }),
    useWhen: Type.String({ minLength: 1 }),
    instructions: Type.Optional(Type.String()),
    requirements: Type.Array(ArchetypeRequirementSchema),
    documents: Type.Array(ArchetypeTemplateInfoSchema),
    workflow: Type.Optional(ArchetypeWorkflowSchema),
  },
  { additionalProperties: false },
);
export type ArchetypeInfo = Static<typeof ArchetypeInfoSchema>;

/** Codes of a definition problem (`ArchetypeCatalogue.problems[]`). */
export const DEFINITION_PROBLEM_CODES = [
  'file-unreadable',
  'file-too-large',
  'yaml-invalid',
  'schema-invalid',
  'kind-mismatch',
  'id-filename-mismatch',
  'id-duplicate',
  'reference-missing',
  'reference-invalid',
  'template-file-invalid',
  'limit-exceeded',
  'requirement-overview-missing',
  'overview-template-invalid',
  'directory-unsafe',
  'unexpected-entry',
  'unknown-kind-directory',
  'unsupported-schema-version',
] as const;
export const DefinitionProblemCodeSchema = closedUnion(DEFINITION_PROBLEM_CODES);
export type DefinitionProblemCode = (typeof DEFINITION_PROBLEM_CODES)[number];

export const DEFINITION_PROBLEM_SEVERITIES = ['error', 'warning'] as const;
export const DefinitionProblemSeveritySchema = closedUnion(DEFINITION_PROBLEM_SEVERITIES);

/** At most this many problems are returned; `problemsTruncated` marks more. */
export const DEFINITION_PROBLEMS_MAX = 50;
export const DEFINITION_PROBLEM_MESSAGE_MAX_LENGTH = 300;

/** One invalid or ignored definition file. The message is plain text and never an absolute path. */
export const DefinitionProblemSchema = Type.Object(
  {
    /** Path relative to `.nevo/definitions`, for example `specification-archetype/feature.yaml`; `''` for a directory-level problem. */
    source: Type.String(),
    /** The definition kind when known. */
    kind: Type.Optional(Type.String({ minLength: 1 })),
    code: DefinitionProblemCodeSchema,
    /** `warning`: the file is ignored but nothing depends on it. */
    severity: DefinitionProblemSeveritySchema,
    message: Type.String({ maxLength: DEFINITION_PROBLEM_MESSAGE_MAX_LENGTH }),
    /** JSON pointer inside the file, for example `/templates/1/documentType`. */
    location: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);
export type DefinitionProblem = Static<typeof DefinitionProblemSchema>;

export const ArchetypeCatalogueSchema = Type.Object(
  {
    /** sha256 of the VALID catalogue content (problems excluded); changes when it changes. */
    revision: Type.String({ minLength: 1 }),
    /** Absent in the real backend (the UI chooses); optional in the demo. */
    defaultArchetypeId: Type.Optional(CatalogueIdSchema),
    documentTypes: Type.Array(DocumentTypeInfoSchema),
    /** Invalid definition files (real backend only); absent when there are none. */
    problems: Type.Optional(
      Type.Array(DefinitionProblemSchema, { maxItems: DEFINITION_PROBLEMS_MAX }),
    ),
    /** True when more problems exist than the {@link DEFINITION_PROBLEMS_MAX} returned. */
    problemsTruncated: Type.Optional(Type.Boolean()),
    /** True when the definition files kept changing while they were read: the catalogue may be out of date. */
    unstableRead: Type.Optional(Type.Boolean()),
    archetypes: Type.Array(ArchetypeInfoSchema),
  },
  { additionalProperties: false },
);
export type ArchetypeCatalogue = Static<typeof ArchetypeCatalogueSchema>;

export const AddedDocumentSchema = Type.Object(
  {
    path: Type.String({ minLength: 1 }),
    /** Absent: the file is created unclassified. */
    type: Type.Optional(CatalogueIdSchema),
    content: Type.String(),
  },
  { additionalProperties: false },
);
export type AddedDocument = Static<typeof AddedDocumentSchema>;

/**
 * Property schemas of the archetype part of the Create request (all archetype fields required: no
 * default archetype in the contract). Exported as a plain record that `CreateSpecRequestSchema`
 * spreads. Counts and byte limits are enforced by the Engine at admission
 * (`DOCUMENT_OPERATION_INVALID`), not here.
 */
export const CreateArchetypeSelectionProperties = {
  archetypeId: CatalogueIdSchema,
  archetypeVersion: Type.Integer({ minimum: 1 }),
  catalogueRevision: Type.String({ minLength: 1 }),
  optionalDocumentIds: Type.Optional(Type.Array(RegisteredDocumentIdSchema, { uniqueItems: true })),
  addedDocuments: Type.Optional(Type.Array(AddedDocumentSchema)),
  folders: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { uniqueItems: true })),
};

export const CreateArchetypeSelectionSchema = Type.Object(CreateArchetypeSelectionProperties, {
  additionalProperties: false,
});
export type CreateArchetypeSelection = Static<typeof CreateArchetypeSelectionSchema>;
