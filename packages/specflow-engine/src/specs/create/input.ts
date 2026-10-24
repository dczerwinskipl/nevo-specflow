import type { AddedDocumentInput } from '../scaffold';
import type { CreateArchetypeRef } from './intent';

/** Trusted Engine create input, distinct from the normalized client intent. */
export type CreateSpecificationTarget =
  | { readonly kind: 'existing'; readonly workspaceId: string }
  | {
      readonly kind: 'new-worktree';
      readonly baseRef: string;
      readonly branch?: string;
      readonly integrationTargetWorkspaceId?: string;
    };

export interface CreateSpecificationInput {
  readonly operationId: string;
  readonly title: string;
  readonly created: string;
  readonly goal?: string;
  readonly slug?: string;
  readonly target: CreateSpecificationTarget;
  /** The archetype is always named: there is no default. */
  readonly archetype: CreateArchetypeRef;
  /** Checked against the catalogue when present (`CATALOGUE_STALE`). */
  readonly catalogueRevision?: string;
  readonly optionalDocumentIds?: readonly string[];
  readonly addedDocuments?: readonly AddedDocumentInput[];
  readonly folders?: readonly string[];
}
