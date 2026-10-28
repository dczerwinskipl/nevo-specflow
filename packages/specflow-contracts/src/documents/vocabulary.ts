import { Type, type Static } from 'typebox';

/**
 * Shared vocabulary of the Specification documents layer. Owned by
 * `docs/reference/api/specification-documents.md` ("Shared vocabulary"); every literal below is
 * defined once and reused by the other schema files of this folder.
 */

/**
 * A union of string literals that keeps its literal type. `Static` of `Type.Union(values.map(Literal))`
 * collapses to `never`, so every closed vocabulary below is built through this helper.
 */
export function closedUnion<const T extends readonly string[]>(values: T) {
  return Type.Unsafe<T[number]>(Type.Union(values.map((value) => Type.Literal(value))));
}

/** Longest id on the wire, in characters. */
export const ID_MAX_LENGTH = 200;

/** Specification and document ids on the wire (existing id pattern). */
export const IdSchema = Type.String({
  minLength: 1,
  maxLength: ID_MAX_LENGTH,
  pattern: '^[a-zA-Z0-9][a-zA-Z0-9._-]*$',
});

/** `reason` and `blockedBy` of a commit state are open kebab-case strings: the documented vocabularies and later additions. */
export const KEBAB_CASE_PATTERN = '^[a-z][a-z0-9]*(-[a-z0-9]+)*$';

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
export const ContentKindSchema = closedUnion(CONTENT_KINDS);
export type ContentKind = (typeof CONTENT_KINDS)[number];

export const CLASSIFICATIONS = ['registered', 'unclassified'] as const;
export const ClassificationSchema = closedUnion(CLASSIFICATIONS);
export type Classification = (typeof CLASSIFICATIONS)[number];

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
export const ActionReasonSchema = closedUnion(ACTION_REASONS);
export type ActionReason = (typeof ACTION_REASONS)[number];

export const ActionSchema = Type.Object(
  {
    available: Type.Boolean(),
    reason: Type.Optional(ActionReasonSchema),
    /** `busy` only: when a retry is worth trying, in milliseconds. Absent when waiting does not help. */
    retryAfterMs: Type.Optional(Type.Integer({ minimum: 0 })),
  },
  { additionalProperties: false },
);
export type Action = Static<typeof ActionSchema>;
