import type { DocumentOperationStatusAction } from '@nevo/specflow-contracts/documents';
import { DOCUMENT_OPERATION_STATUS_ACTIONS } from '@nevo/specflow-contracts/documents';

import type { ManifestDocument } from '../../../model';

/**
 * The action kinds of a document change. They are the status vocabulary of the contract
 * (`save-all` is the batch save), so a new action cannot be added in one place only. The status
 * vocabulary also names the `manual-commit` operation, which is not a document change (it has its own
 * journal), so it is not one of these.
 */
export type DocumentChangeAction = Exclude<DocumentOperationStatusAction, 'manual-commit'>;
export const DOCUMENT_CHANGE_ACTIONS: readonly DocumentChangeAction[] =
  DOCUMENT_OPERATION_STATUS_ACTIONS.filter(
    (action): action is DocumentChangeAction => action !== 'manual-commit',
  );

/** The content of one path before or after an operation: its hash and size, or `null` when absent. */
export type FileState = { readonly sha256: string; readonly bytes: number } | null;

/** Where the bytes of a path come from when the operation writes it. */
export type PathSource =
  /** The hash-addressed payload store holds the content (key: `post.sha256`). */
  | { readonly kind: 'payload' }
  /** The bytes are those of another path of the same plan, which the operation removes (rename, move). */
  | { readonly kind: 'moved-from'; readonly path: string }
  /** Nothing to write: the path is removed (or unchanged). */
  | { readonly kind: 'none' };

export const PLANNED_PATH_ROLES = ['document', 'manifest'] as const;
export type PlannedPathRole = (typeof PLANNED_PATH_ROLES)[number];

/** One path of an operation, relative to the checkout root, with the states it moves between. */
export interface PlannedPath {
  readonly path: string;
  readonly role: PlannedPathRole;
  readonly pre: FileState;
  readonly post: FileState;
  readonly source: PathSource;
}

/** A document the operation reports as written. `path` is relative to the Specification directory. */
export interface PlannedDocument {
  readonly id: string;
  readonly path: string;
  readonly type?: string;
  readonly sha256: string;
  readonly bytes: number;
}

/** A template pinned by a create: the rendered content hash is what the operation will write. */
export interface PlannedTemplate {
  readonly path: string;
  readonly templateId: string;
  readonly sha256: string;
}

/** The registry after the operation; present exactly when the manifest is one of the planned paths. */
export interface PlannedRegistry {
  readonly documents: readonly ManifestDocument[];
  readonly folders: readonly string[];
}

export const DOCUMENT_CHANGE_PLAN_VERSION = 1;

/**
 * Everything a writer needs to apply an operation and everything the queue needs to verify it:
 * hashes, never content. The plan is stored as ONE hash-addressed file in the payload store; the
 * journal keeps only its evidence.
 */
export interface DocumentChangePlan {
  readonly version: typeof DOCUMENT_CHANGE_PLAN_VERSION;
  readonly action: DocumentChangeAction;
  readonly specId: string;
  readonly slug: string;
  /** Checkout-relative Specification directory, `specs/active/<slug>`. */
  readonly directory: string;
  /** In write order: document paths first, the manifest (when present) last. */
  readonly paths: readonly PlannedPath[];
  readonly documents: readonly PlannedDocument[];
  readonly removedDocumentIds: readonly string[];
  /** Explicit folders the operation created or moved to (Specification-relative). */
  readonly folders: readonly string[];
  /** Ids allocated by this operation, in allocation order. */
  readonly allocatedIds: readonly string[];
  readonly templates: readonly PlannedTemplate[];
  readonly registry?: PlannedRegistry;
  /** A folder delete: the folder it removes (Specification-relative). Absent for every other plan. */
  readonly removedFolder?: string;
}

/** Content the writer must put in the payload store before the journal is published. */
export interface PlanPayload {
  readonly sha256: string;
  readonly content: string;
}

export function manifestPathOf(plan: Pick<DocumentChangePlan, 'directory'>): string {
  return plan.directory + '/specification.yaml';
}
