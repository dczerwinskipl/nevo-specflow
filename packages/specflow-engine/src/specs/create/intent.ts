import type { AddedDocumentInput } from '../scaffold';

import { CreateOperationError } from './error';
import { validateBranchName } from '../../version-control/git/refs';
import { isExplicitSpecificationSlug } from '../model';
import { sha256Hex } from '../../hash';

export type ClientOverride =
  { readonly kind: 'omitted' } | { readonly kind: 'explicit'; readonly value: string };

export type ClientCreateTarget =
  | { readonly kind: 'existing'; readonly workspaceId: string }
  | {
      readonly kind: 'new-worktree';
      readonly baseRef: ClientOverride;
      readonly branch: ClientOverride;
      /** Omission retains the project default and legacy intent fingerprint. */
      readonly integrationTargetWorkspaceId?: string;
    };

/** The archetype a Create names. There is no default archetype in any layer. */
export interface CreateArchetypeRef {
  readonly id: string;
  readonly version: number;
}

/**
 * A file added at Create, as durable evidence: the content itself is never stored in the intent or
 * the journal (it lives in the hash-addressed payload store).
 */
export interface CreateAddedDocumentEvidence {
  readonly path: string;
  /** Absent: the file is created unclassified. */
  readonly type?: string;
  readonly sha256: string;
  /** UTF-8 bytes of the content. */
  readonly bytes: number;
}

/**
 * Canonical client intent; generated dates and currently configured Git defaults
 * are deliberately absent. Transport adapters preserve omission vs explicitness.
 */
export interface CreateClientIntent {
  readonly title: string;
  readonly goal?: string;
  /** Omitted keeps the title-derived slug. */
  readonly slug?: string;
  readonly target: ClientCreateTarget;
  readonly archetype: CreateArchetypeRef;
  /**
   * Precondition checked against the catalogue when a new operation is admitted (the HTTP schema
   * always sends it). Not part of the fingerprint.
   */
  readonly catalogueRevision?: string;
  /** Suggested template ids to scaffold: sorted, unique. */
  readonly optionalDocumentIds: readonly string[];
  /** In request order (the order decides the allocated document ids). */
  readonly addedDocuments: readonly CreateAddedDocumentEvidence[];
  /** Explicit folders: sorted, unique. */
  readonly folders: readonly string[];
}

export type CreateClientTargetInput =
  | { readonly kind: 'existing'; readonly workspaceId: string }
  | {
      readonly kind: 'new-worktree';
      readonly baseRef?: string;
      readonly branch?: string;
      readonly integrationTargetWorkspaceId?: string;
    };

/** Everything of the intent except the added file contents, which are reduced to evidence. */
interface CreateClientIntentFields {
  readonly title: string;
  readonly goal?: string;
  readonly slug?: string;
  readonly target: CreateClientTargetInput;
  readonly archetype: CreateArchetypeRef;
  readonly catalogueRevision?: string;
  readonly optionalDocumentIds?: readonly string[];
  readonly folders?: readonly string[];
}

export interface CreateClientIntentInput extends CreateClientIntentFields {
  readonly addedDocuments?: readonly AddedDocumentInput[];
}

/** Normalises a request; added contents are hashed and measured in UTF-8 bytes. */
export function normalizeCreateClientIntent(input: CreateClientIntentInput): CreateClientIntent {
  return normalizeIntentFields(
    input,
    (input.addedDocuments ?? []).map((document) => ({
      path: document.path,
      ...(document.type !== undefined ? { type: document.type } : {}),
      sha256: sha256Hex(document.content),
      bytes: Buffer.byteLength(document.content, 'utf8'),
    })),
  );
}

/**
 * Re-normalises a persisted intent (already evidence-only) for the journal codec: the result must
 * equal the persisted form, so the stored intent is exactly what normalisation produces.
 */
export function normalizePersistedCreateIntent(persisted: CreateClientIntent): CreateClientIntent {
  return normalizeIntentFields(
    {
      title: persisted.title,
      goal: persisted.goal,
      slug: persisted.slug,
      archetype: persisted.archetype,
      catalogueRevision: persisted.catalogueRevision,
      optionalDocumentIds: persisted.optionalDocumentIds,
      folders: persisted.folders,
      target:
        persisted.target.kind === 'existing'
          ? persisted.target
          : {
              kind: 'new-worktree',
              ...(persisted.target.baseRef.kind === 'explicit'
                ? { baseRef: persisted.target.baseRef.value }
                : {}),
              ...(persisted.target.branch.kind === 'explicit'
                ? { branch: persisted.target.branch.value }
                : {}),
              ...(persisted.target.integrationTargetWorkspaceId !== undefined
                ? { integrationTargetWorkspaceId: persisted.target.integrationTargetWorkspaceId }
                : {}),
            },
    },
    persisted.addedDocuments,
  );
}

function normalizeIntentFields(
  input: CreateClientIntentFields,
  addedDocuments: readonly CreateAddedDocumentEvidence[],
): CreateClientIntent {
  const title = input.title.replace(/\s+/gu, ' ').trim();
  const goal = input.goal?.trim();
  if (!title || title.length > 200) {
    throw new CreateOperationError('CREATE_OPERATION_INVALID', 'Invalid specification title.');
  }
  if (input.slug !== undefined && !isExplicitSpecificationSlug(input.slug)) {
    throw new CreateOperationError('CREATE_OPERATION_INVALID', 'Invalid specification slug.');
  }
  if (
    input.target.kind === 'new-worktree' &&
    input.target.branch !== undefined &&
    !isValidBranchName(input.target.branch)
  ) {
    throw new CreateOperationError('BRANCH_NAME_INVALID', 'Invalid branch name.');
  }
  const archetype = input.archetype;
  if (
    typeof archetype?.id !== 'string' ||
    archetype.id.length === 0 ||
    !Number.isInteger(archetype.version) ||
    archetype.version < 1
  ) {
    throw new CreateOperationError('CREATE_OPERATION_INVALID', 'Invalid archetype selection.');
  }
  if (
    input.catalogueRevision !== undefined &&
    (typeof input.catalogueRevision !== 'string' || input.catalogueRevision.length === 0)
  ) {
    throw new CreateOperationError('CREATE_OPERATION_INVALID', 'Invalid catalogue revision.');
  }
  const target = normalizeClientTarget(input.target);
  return {
    title,
    ...(goal ? { goal } : {}),
    ...(input.slug !== undefined ? { slug: input.slug } : {}),
    target,
    archetype: { id: archetype.id, version: archetype.version },
    ...(input.catalogueRevision !== undefined
      ? { catalogueRevision: input.catalogueRevision }
      : {}),
    optionalDocumentIds: sortedUnique(input.optionalDocumentIds ?? []),
    addedDocuments: addedDocuments.map((document) => ({
      path: document.path,
      ...(document.type !== undefined ? { type: document.type } : {}),
      sha256: document.sha256,
      bytes: document.bytes,
    })),
    folders: sortedUnique(input.folders ?? []),
  };
}

/**
 * The fingerprint covers the intent EXCEPT `catalogueRevision`: archetype id and version,
 * suggestions, folders and, for added documents, path, type and the sha256 of the content (never the
 * content). The revision is a precondition checked when a NEW operation is admitted, not part of the
 * operation's identity, so a retry of the same operation after the catalogue changed replays the
 * stored result instead of conflicting.
 */
export function fingerprintCreateClientIntent(intent: CreateClientIntent): string {
  const { catalogueRevision: _precondition, ...identity } = intent;
  return sha256Hex(JSON.stringify(identity));
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}

function normalizeClientTarget(input: CreateClientTargetInput): ClientCreateTarget {
  switch (input.kind) {
    case 'existing':
      return { kind: 'existing', workspaceId: input.workspaceId };
    case 'new-worktree':
      return {
        kind: 'new-worktree',
        baseRef: normalizeOverride(input.baseRef),
        branch: normalizeOverride(input.branch),
        ...(input.integrationTargetWorkspaceId !== undefined
          ? { integrationTargetWorkspaceId: input.integrationTargetWorkspaceId }
          : {}),
      };
    default: {
      const exhaustive: never = input;
      return exhaustive;
    }
  }
}

function isValidBranchName(branch: string): boolean {
  try {
    validateBranchName(branch);
    return true;
  } catch {
    return false;
  }
}

function normalizeOverride(value: string | undefined): ClientOverride {
  if (value === undefined) return { kind: 'omitted' };
  return { kind: 'explicit', value };
}
