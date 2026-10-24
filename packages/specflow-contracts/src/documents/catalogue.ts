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

export const CatalogueProblemSchema = Type.Object(
  { source: Type.String(), code: Type.String(), message: Type.String() },
  { additionalProperties: false },
);

export const ArchetypeCatalogueSchema = Type.Object(
  {
    /** sha256 of the canonical catalogue content; changes on any edit. */
    revision: Type.String({ minLength: 1 }),
    /** Absent in the real backend (the UI chooses); optional in the demo. */
    defaultArchetypeId: Type.Optional(CatalogueIdSchema),
    documentTypes: Type.Array(DocumentTypeInfoSchema),
    /** Reserved for user-defined archetype files (not implemented); absent or empty for built-ins. */
    problems: Type.Optional(Type.Array(CatalogueProblemSchema)),
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
