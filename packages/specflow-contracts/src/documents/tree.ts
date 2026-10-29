import { Type, type Static } from 'typebox';

import {
  ActionSchema,
  CatalogueIdSchema,
  ClassificationSchema,
  ContentKindSchema,
  IdSchema,
  KEBAB_CASE_PATTERN,
  UuidSchema,
  closedUnion,
} from './vocabulary';

/** Whether the Specification's archetype definition file exists, is valid, or is gone. */
export const ARCHETYPE_DEFINED_STATES = ['defined', 'invalid', 'absent'] as const;
export const ArchetypeDefinedSchema = closedUnion(ARCHETYPE_DEFINED_STATES);
export type ArchetypeDefined = (typeof ARCHETYPE_DEFINED_STATES)[number];

/** Per-document commit marker while a batch covers the path, or while the ledger holds the path (`uncommitted`). */
export const DOCUMENT_TREE_COMMIT_STATES = ['pending', 'failed', 'uncommitted'] as const;
export const DocumentTreeCommitStateSchema = closedUnion(DOCUMENT_TREE_COMMIT_STATES);
export type DocumentTreeCommitState = (typeof DOCUMENT_TREE_COMMIT_STATES)[number];

/** Codes of `DocumentTree.issues`; the last two mean Close archive will refuse. */
export const DOCUMENT_ISSUE_CODES = [
  'dangling',
  'unclassified',
  'requirement-unmet',
  'skipped-entry',
  'path-case-collision',
  'archive-limit',
] as const;
export const DocumentIssueCodeSchema = closedUnion(DOCUMENT_ISSUE_CODES);
export type DocumentIssueCode = (typeof DOCUMENT_ISSUE_CODES)[number];

/** `auto`: queued commits; `manual`: auto-commit is off and writes complete `uncommitted`. */
export const COMMIT_POLICY_MODES = ['auto', 'manual'] as const;
export const CommitPolicyModeSchema = closedUnion(COMMIT_POLICY_MODES);
export type CommitPolicyMode = (typeof COMMIT_POLICY_MODES)[number];

export const DocumentTreeFolderSchema = Type.Object(
  {
    /** The root folder has the path `''`. */
    path: Type.String(),
    /**
     * The folder revision a folder `rename`, `move` or `delete` sends as `expectedRevision` (commit
     * state excluded). Absent for the root folder, which no operation changes.
     */
    revision: Type.Optional(Type.String({ minLength: 1 })),
    actions: Type.Object(
      { rename: ActionSchema, move: ActionSchema, delete: ActionSchema },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);

export const DocumentTreeDocumentSchema = Type.Object(
  {
    id: IdSchema,
    path: Type.String({ minLength: 1 }),
    classification: ClassificationSchema,
    /** Set for registered documents and absent for unclassified ones (guaranteed by the Engine, not by this schema). */
    type: Type.Optional(CatalogueIdSchema),
    kind: ContentKindSchema,
    mediaType: Type.String({ minLength: 1 }),
    size: Type.Integer({ minimum: 0 }),
    revision: Type.String({ minLength: 1 }),
    /** True only for `overview` (guaranteed by the Engine, not by this schema). */
    protected: Type.Boolean(),
    editable: Type.Boolean(),
    satisfiesRequirement: Type.Boolean(),
    /**
     * While a queued, failed or recovery batch covers the path. `uncommitted` is a ledger entry
     * (`reason` `auto-commit-off` or `abandoned`), kept until a commit holds the path.
     */
    commit: Type.Optional(
      Type.Object(
        {
          state: DocumentTreeCommitStateSchema,
          operationId: UuidSchema,
          recoveryRequired: Type.Optional(Type.Boolean()),
          /** Why `pending` waits or why `failed` / `uncommitted` (open kebab-case, as `CommitInfo.reason`). */
          reason: Type.Optional(Type.String({ pattern: KEBAB_CASE_PATTERN })),
          /** The commit port's own reason when a Git blocker is the cause. */
          blockedBy: Type.Optional(Type.String({ pattern: KEBAB_CASE_PATTERN })),
          /** `pending` only. */
          attempts: Type.Optional(Type.Integer({ minimum: 0 })),
          /** `pending` only; ISO. A retry is not made before this instant. */
          nextAttemptAt: Type.Optional(Type.String()),
          /** ISO; absent while the write itself is still in progress. */
          queuedAt: Type.Optional(Type.String()),
        },
        { additionalProperties: false },
      ),
    ),
    actions: Type.Object(
      {
        /** Save the text of the document; unavailable for `not-editable` kinds and wherever a write is refused. */
        save: Type.Optional(ActionSchema),
        rename: ActionSchema,
        move: ActionSchema,
        delete: ActionSchema,
        classify: ActionSchema,
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);

export const DocumentTreeDanglingSchema = Type.Object(
  {
    id: IdSchema,
    path: Type.String({ minLength: 1 }),
    type: CatalogueIdSchema,
    /** `delete` removes the registration. */
    actions: Type.Object({ delete: ActionSchema }, { additionalProperties: false }),
  },
  { additionalProperties: false },
);

export const RequirementResultSchema = Type.Object(
  {
    documentType: CatalogueIdSchema,
    minCount: Type.Integer({ minimum: 0 }),
    count: Type.Integer({ minimum: 0 }),
    satisfied: Type.Boolean(),
  },
  { additionalProperties: false },
);
export type RequirementResult = Static<typeof RequirementResultSchema>;

export const DocumentIssueSchema = Type.Object(
  {
    code: DocumentIssueCodeSchema,
    path: Type.Optional(Type.String()),
    documentType: Type.Optional(CatalogueIdSchema),
  },
  { additionalProperties: false },
);
export type DocumentIssue = Static<typeof DocumentIssueSchema>;

export const DocumentTreeCommitsSchema = Type.Object(
  {
    pending: Type.Integer({ minimum: 0 }),
    failed: Type.Integer({ minimum: 0 }),
    /** Operations whose commit failed and wait for a decision, including the ones counted in `recoveryRequired`. */
    recoveryRequired: Type.Integer({ minimum: 0 }),
    /** Paths of this Specification in the uncommitted-changes ledger (the files stay on disk, not in Git). */
    uncommitted: Type.Optional(Type.Integer({ minimum: 0 })),
    /**
     * Whether the Engine commits the documents of this project by itself (`git.commits.auto.documents`).
     * Absent while Git is disabled (the setting is inert then).
     */
    policy: Type.Optional(CommitPolicyModeSchema),
    /** ISO; the queue time of the oldest operation that still waits for its commit. */
    oldestPendingAt: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);
export type DocumentTreeCommits = Static<typeof DocumentTreeCommitsSchema>;

export const DocumentTreeSchema = Type.Object(
  {
    revision: Type.String({ minLength: 1 }),
    archetype: Type.Object(
      {
        id: CatalogueIdSchema,
        version: Type.Integer({ minimum: 1 }),
        title: Type.Optional(Type.String()),
        /** `invalid`: the definition file is in `problems[]`; `absent`: no file, the persisted snapshot still governs. */
        defined: Type.Optional(ArchetypeDefinedSchema),
      },
      { additionalProperties: false },
    ),
    folders: Type.Array(DocumentTreeFolderSchema),
    documents: Type.Array(DocumentTreeDocumentSchema),
    dangling: Type.Array(DocumentTreeDanglingSchema),
    completeness: Type.Object(
      { complete: Type.Boolean(), requirements: Type.Array(RequirementResultSchema) },
      { additionalProperties: false },
    ),
    /** Advisory. */
    capabilities: Type.Object(
      {
        createFile: ActionSchema,
        createFolder: ActionSchema,
        import: ActionSchema,
        classify: ActionSchema,
        /** Extensions creatable and editable as text, for example `['md', 'txt']`. */
        formats: Type.Array(Type.String()),
      },
      { additionalProperties: false },
    ),
    issues: Type.Array(DocumentIssueSchema),
    /** From the journals, no Git; part of the tree revision. */
    commits: Type.Optional(DocumentTreeCommitsSchema),
    truncated: Type.Boolean(),
    skippedEntries: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);
export type DocumentTree = Static<typeof DocumentTreeSchema>;

/** `GET /documents/:documentId`. `content` is present for kind `text` within the JSON read limit only. */
export const DocumentContentSchema = Type.Object(
  {
    id: IdSchema,
    path: Type.String({ minLength: 1 }),
    /** Derived: first H1 of a markdown text, else the file stem. */
    title: Type.String(),
    classification: ClassificationSchema,
    type: Type.Optional(CatalogueIdSchema),
    kind: ContentKindSchema,
    mediaType: Type.String({ minLength: 1 }),
    size: Type.Integer({ minimum: 0 }),
    revision: Type.String({ minLength: 1 }),
    editable: Type.Boolean(),
    content: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);
export type DocumentContent = Static<typeof DocumentContentSchema>;
