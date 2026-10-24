import { Type, type Static } from 'typebox';

/**
 * Shared vocabulary of the Specification documents layer. Owned by
 * `docs/reference/api/specification-documents.md` ("Shared vocabulary"); every literal below is
 * defined once and reused by the other schema files of this folder.
 */

/** Specification and document ids on the wire (existing id pattern). */
export const IdSchema = Type.String({
  minLength: 1,
  maxLength: 200,
  pattern: '^[a-zA-Z0-9][a-zA-Z0-9._-]*$',
});

export const UuidSchema = Type.String({
  pattern:
    '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$',
});

/** Catalogue ids (archetype, document type): `^[a-z][a-z0-9-]{0,31}$`. */
export const CATALOGUE_ID_PATTERN = '^[a-z][a-z0-9-]{0,31}$';
export const CatalogueIdSchema = Type.String({ pattern: CATALOGUE_ID_PATTERN });

/** Registered document ids and template ids: `^[a-z0-9][a-z0-9-]{0,63}$`. */
export const DOCUMENT_ID_PATTERN = '^[a-z0-9][a-z0-9-]{0,63}$';
export const RegisteredDocumentIdSchema = Type.String({ pattern: DOCUMENT_ID_PATTERN });

export const CONTENT_KINDS = ['text', 'image', 'binary'] as const;
export const ContentKindSchema = Type.Union(CONTENT_KINDS.map((kind) => Type.Literal(kind)));
export type ContentKind = Static<typeof ContentKindSchema>;

export const CLASSIFICATIONS = ['registered', 'unclassified'] as const;
export const ClassificationSchema = Type.Union(CLASSIFICATIONS.map((value) => Type.Literal(value)));
export type Classification = Static<typeof ClassificationSchema>;

/** Reasons an action is unavailable (kebab-case). Advisory in reads, authoritative in write errors. */
export const ACTION_REASONS = [
  'protected',
  'root',
  'archived',
  'branch-protected',
  'branch-not-allowed',
  'commit-blocked',
  'git-policy-invalid',
  'busy',
  'not-editable',
  'dangling',
] as const;
export const ActionReasonSchema = Type.Union(ACTION_REASONS.map((reason) => Type.Literal(reason)));
export type ActionReason = Static<typeof ActionReasonSchema>;

export const ActionSchema = Type.Object(
  { available: Type.Boolean(), reason: Type.Optional(ActionReasonSchema) },
  { additionalProperties: false },
);
export type Action = Static<typeof ActionSchema>;
