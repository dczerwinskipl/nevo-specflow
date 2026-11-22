import { Type, type Static } from 'typebox';

import { SpecIdSchema, WorkspaceIdSchema } from '../identifiers';

/**
 * Why a registered workspace cannot be used now. A closed set: the Runtime never serves the
 * Engine's own message.
 */
export const WorkspaceUnavailableReasonSchema = Type.Union([
  /** The registered folder failed verification on disk (or by `git status`). */
  Type.Literal('checkout-unavailable'),
  /** The folder no longer is the registered checkout (moved, symlinked or redirected). */
  Type.Literal('checkout-mismatch'),
  /** Git is enabled but cannot be reached. */
  Type.Literal('git-unavailable'),
  /** Git is enabled and does not list the checkout as a live worktree. */
  Type.Literal('git-membership-mismatch'),
], { description: 'Present exactly when available is false. checkout-unavailable: folder or git status verification failed; checkout-mismatch: moved, symlinked or redirected folder; git-unavailable: Git cannot be reached; git-membership-mismatch: Git does not list this live worktree. Internal Engine error descriptions and paths are never exposed.' });

export type WorkspaceUnavailableReason = Static<typeof WorkspaceUnavailableReasonSchema>;

export const WorkspaceListItemSchema = Type.Object(
  {
    workspaceId: WorkspaceIdSchema,
    kind: Type.Union([Type.Literal('primary'), Type.Literal('linked')], { description: 'The primary project checkout or one registered linked worktree.' }),
    /** Display label: the checkout folder name (the repository folder for the primary one). */
    name: Type.String({ minLength: 1, description: 'Checkout folder name (the repository folder for the primary checkout).' }),
    /** Absolute registered folder; a client shortens it for display. */
    path: Type.String({ minLength: 1, description: 'Absolute registered checkout folder; clients should shorten it for display.' }),
    available: Type.Boolean({ description: 'True only when the Engine verifies the checkout on disk and, with Git enabled, Git sees it as a live worktree.' }),
    /** Present exactly when `available` is false. */
    unavailableReason: Type.Optional(WorkspaceUnavailableReasonSchema),
    /** The checkout the Runtime itself runs in. */
    isRuntimeWorkspace: Type.Boolean({ description: 'True for the checkout in which this Runtime process runs.' }),
    /**
     * The Specifications bound to this workspace whose manifest is readable, limited to those the
     * caller may view (`spec.view`); the others are left out without a trace.
     */
    specifications: Type.Array(
      Type.Object({ specId: SpecIdSchema, title: Type.String() }, { additionalProperties: false }),
      { description: 'Readable Specifications bound to this workspace; individually filtered by spec.view at the trusted {projectId, specId} scope. An unavailable workspace lists no Specifications.' },
    ),
    /**
     * Uncommitted changes. Present only when Git is enabled and the checkout is available and on a
     * branch; absent otherwise (Git disabled, unavailable or detached checkout).
     */
    dirty: Type.Optional(Type.Boolean({ description: 'Uncommitted Git changes, including untracked files. Present only when Git is enabled and checkout is available on a branch; absent otherwise.' })),
  },
  { additionalProperties: false },
);

export type WorkspaceListItem = Static<typeof WorkspaceListItemSchema>;

/** `GET /api/workspaces`: every registered workspace of the project, in registry order. */
export const WorkspaceListSchema = Type.Object(
  {
    /** The project folder (primary workspace): the fallback when a remembered one is gone. */
    projectFolderId: WorkspaceIdSchema,
    workspaces: Type.Array(WorkspaceListItemSchema),
  },
  { additionalProperties: false },
);

export type WorkspaceList = Static<typeof WorkspaceListSchema>;

export const WorkspaceListErrorSchema = Type.Object(
  { error: Type.Literal('WORKSPACES_UNAVAILABLE'), code: Type.Literal('WORKSPACES_UNAVAILABLE') },
  { additionalProperties: false },
);
