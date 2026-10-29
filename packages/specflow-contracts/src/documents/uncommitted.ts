import { Type, type Static } from 'typebox';

import { CommitInfoSchema } from './operations';
import { CommitPolicyModeSchema } from './tree';
import { IdSchema, UuidSchema, closedUnion } from './vocabulary';

/** Most entries the ledger of one Specification holds (the Engine refuses a 201st path). */
export const UNCOMMITTED_ENTRIES_MAX = 200;

/** Why a path is uncommitted: the policy is off, or its failed batch was abandoned. */
export const UNCOMMITTED_REASONS = ['auto-commit-off', 'abandoned'] as const;
export const UncommittedReasonSchema = closedUnion(UNCOMMITTED_REASONS);
export type UncommittedReason = (typeof UNCOMMITTED_REASONS)[number];

/** Where the effective commit policy comes from. */
export const COMMIT_POLICY_SOURCES = ['project', 'local', 'default'] as const;
export const CommitPolicySourceSchema = closedUnion(COMMIT_POLICY_SOURCES);
export type CommitPolicySource = (typeof COMMIT_POLICY_SOURCES)[number];

export const UncommittedEntrySchema = Type.Object(
  {
    /** Checkout-relative path. */
    path: Type.String({ minLength: 1 }),
    /** The registered or unclassified document the path holds, when it holds one. */
    documentId: Type.Optional(IdSchema),
    reason: UncommittedReasonSchema,
    /** ISO; when the Engine last recorded the path. */
    recordedAt: Type.String(),
    /** How many operations changed the path since it was last committed. */
    operations: Type.Integer({ minimum: 1 }),
  },
  { additionalProperties: false },
);
export type UncommittedEntry = Static<typeof UncommittedEntrySchema>;

/** `GET /api/specs/:specId/uncommitted`: the ledger of the Specification, the policy and the queue. */
export const UncommittedViewSchema = Type.Object(
  {
    /** sha256 of the sorted `path:postSha256` list; changes with any entry. */
    ledgerRevision: Type.String({ minLength: 1 }),
    policy: Type.Object(
      { documents: CommitPolicyModeSchema, source: CommitPolicySourceSchema },
      { additionalProperties: false },
    ),
    entries: Type.Array(UncommittedEntrySchema, { maxItems: UNCOMMITTED_ENTRIES_MAX }),
    /** Why a manual commit may be unavailable: the work of this Specification that has not settled. */
    queue: Type.Object(
      {
        pending: Type.Integer({ minimum: 0 }),
        failed: Type.Integer({ minimum: 0 }),
        recoveryRequired: Type.Integer({ minimum: 0 }),
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);
export type UncommittedView = Static<typeof UncommittedViewSchema>;

/** Most paths a manual commit may name (the ledger holds at most this many). */
export const MANUAL_COMMIT_PATHS_MAX = UNCOMMITTED_ENTRIES_MAX;

/**
 * Scopes a manual commit takes over HTTP; the `definitions` scope is the CLI's alone (ADR 0018 decision 8). `all` takes
 * only the ledger owners whose Specification the caller may also Manage; the others stay untouched.
 */
export const MANUAL_COMMIT_HTTP_SCOPES = ['specification', 'all'] as const;
export const ManualCommitScopeSchema = closedUnion(MANUAL_COMMIT_HTTP_SCOPES);
export type ManualCommitScope = (typeof MANUAL_COMMIT_HTTP_SCOPES)[number];

/**
 * `POST /api/specs/:specId/commit`. `message` is judged by the Engine (first line 1-100 characters,
 * body at most 2000, no NUL: `MANUAL_COMMIT_MESSAGE_INVALID`); `paths` is a subset of the ledger
 * paths, closed under shared operations (`MANUAL_COMMIT_SUBSET_INVALID`); `ledgerRevision` is a
 * precondition (`MANUAL_COMMIT_STALE`).
 */
export const ManualCommitInputSchema = Type.Object(
  {
    operationId: UuidSchema,
    scope: Type.Optional(ManualCommitScopeSchema),
    message: Type.Optional(Type.String()),
    paths: Type.Optional(
      Type.Array(Type.String({ minLength: 1 }), { minItems: 1, maxItems: MANUAL_COMMIT_PATHS_MAX }),
    ),
    ledgerRevision: Type.Optional(Type.String({ minLength: 1 })),
  },
  { additionalProperties: false },
);
export type ManualCommitInput = Static<typeof ManualCommitInputSchema>;

/**
 * The answer of a manual commit: `commit.state` is `committed` (with `sha`) or `not-applicable`
 * (`nothing-to-commit`: every path already equals HEAD). `paths` are the files the commit holds;
 * `remaining` is what the ledger still holds for the scope after it.
 */
export const ManualCommitResultSchema = Type.Object(
  {
    operationId: UuidSchema,
    commit: CommitInfoSchema,
    paths: Type.Array(Type.String({ minLength: 1 }), { maxItems: MANUAL_COMMIT_PATHS_MAX }),
    remaining: Type.Object(
      {
        entries: Type.Integer({ minimum: 0, maximum: UNCOMMITTED_ENTRIES_MAX }),
        ledgerRevision: Type.String({ minLength: 1 }),
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);
export type ManualCommitResult = Static<typeof ManualCommitResultSchema>;
