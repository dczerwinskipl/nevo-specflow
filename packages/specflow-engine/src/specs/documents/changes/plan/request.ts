import type { DocumentOperationInput } from '@nevo/specflow-contracts/documents';

import { documentChangeError } from '../errors';

/** A client request of a document change, normalised: one shape per action. Contents are strings. */
export interface SaveRequest {
  readonly action: 'save';
  readonly documentId: string;
  readonly content: string;
  readonly expectedRevision: string;
}

export interface SaveAllEntry {
  readonly documentId: string;
  readonly content: string;
  readonly expectedRevision: string;
}

export interface SaveAllRequest {
  readonly action: 'save-all';
  readonly documents: readonly SaveAllEntry[];
}

export interface CreateEntry {
  /** Relative to the Specification directory. */
  readonly path: string;
  /** Absent: the file is created unclassified. */
  readonly type?: string;
  /** The text. For a template it is the rendered template. */
  readonly content: string;
  /** Present when `content` is the rendering of this template. */
  readonly templateId?: string;
}

export interface CreateRequest {
  readonly action: 'create';
  readonly documents: readonly CreateEntry[];
  readonly folders: readonly string[];
  /** The catalogue revision the client rendered against; required when any entry has a template. */
  readonly catalogueRevision?: string;
}

/**
 * A create entry that names a template of the Specification's archetype instead of carrying text.
 * Admission renders it from the project catalogue and turns it into a {@link CreateEntry}; the planner
 * never sees this shape.
 */
export interface TemplateCreateEntry {
  /** Relative to the Specification directory; absent: the template's own filename. */
  readonly path?: string;
  /** Absent: the template's document type. A different one is refused. */
  readonly type?: string;
  readonly templateId: string;
  /** Never set: a template entry has no text of its own. */
  readonly content?: undefined;
}

/** A create as a client states it: entries with text, and entries that name a template. */
export interface UnresolvedCreateRequest {
  readonly action: 'create';
  readonly documents: readonly (CreateEntry | TemplateCreateEntry)[];
  readonly folders: readonly string[];
  readonly catalogueRevision?: string;
}

/** What the writer accepts: a planner request, or a create that may still name templates. */
export type DocumentWriteRequest = DocumentChangeRequest | UnresolvedCreateRequest;

export interface FolderRequest {
  readonly action: 'folder';
  readonly path: string;
}

export type StructuralTarget =
  | { readonly kind: 'document'; readonly documentId: string }
  | { readonly kind: 'folder'; readonly path: string };

export interface RenameRequest {
  readonly action: 'rename';
  readonly target: StructuralTarget;
  readonly name: string;
  readonly expectedRevision: string;
}

export interface MoveRequest {
  readonly action: 'move';
  readonly target: StructuralTarget;
  /** `''` is the Specification root. */
  readonly targetFolder: string;
  readonly expectedRevision: string;
}

export interface DeleteRequest {
  readonly action: 'delete';
  readonly target: StructuralTarget;
  readonly expectedRevision: string;
}

export interface ClassifyRequest {
  readonly action: 'classify';
  readonly documentId: string;
  readonly type: string;
  readonly expectedRevision: string;
}

export type StructuralRequest = RenameRequest | MoveRequest | DeleteRequest | ClassifyRequest;

export type DocumentChangeRequest =
  SaveRequest | SaveAllRequest | CreateRequest | FolderRequest | StructuralRequest;

function invalid(message: string): Error {
  return documentChangeError('operation-invalid', message);
}

/**
 * The flat wire shape of rename, move, delete and classify as one request per action. Which fields
 * apply to which action is decided here: a missing required field and a field that does not belong
 * are both `DOCUMENT_OPERATION_INVALID`.
 */
export function normalizeDocumentOperationInput(input: DocumentOperationInput): StructuralRequest {
  const target = targetOf(input);
  const unexpected = (...fields: ('name' | 'targetFolder' | 'type')[]): void => {
    for (const field of fields) {
      if (input[field] !== undefined) {
        throw invalid(`"${field}" does not apply to ${input.action}.`);
      }
    }
  };

  switch (input.action) {
    case 'rename':
      unexpected('targetFolder', 'type');
      if (input.name === undefined) {
        throw invalid('"name" is required to rename.');
      }

      return {
        action: 'rename',
        target,
        name: input.name,
        expectedRevision: input.expectedRevision,
      };
    case 'move':
      unexpected('name', 'type');
      if (input.targetFolder === undefined) {
        throw invalid('"targetFolder" is required to move.');
      }

      return {
        action: 'move',
        target,
        targetFolder: input.targetFolder,
        expectedRevision: input.expectedRevision,
      };
    case 'delete':
      unexpected('name', 'targetFolder', 'type');

      return { action: 'delete', target, expectedRevision: input.expectedRevision };
    case 'classify':
      unexpected('name', 'targetFolder');
      if (target.kind !== 'document') {
        throw invalid('Only a document can be classified.');
      }

      if (input.type === undefined) {
        throw invalid('"type" is required to classify.');
      }

      return {
        action: 'classify',
        documentId: target.documentId,
        type: input.type,
        expectedRevision: input.expectedRevision,
      };
    default: {
      const exhaustive: never = input.action;

      return exhaustive;
    }
  }
}

function targetOf(input: DocumentOperationInput): StructuralTarget {
  switch (input.kind) {
    case 'document':
      if (input.documentId === undefined || input.path !== undefined) {
        throw invalid('A document target is named by "documentId" only.');
      }

      return { kind: 'document', documentId: input.documentId };
    case 'folder':
      if (input.path === undefined || input.documentId !== undefined) {
        throw invalid('A folder target is named by "path" only.');
      }

      return { kind: 'folder', path: input.path };
    default: {
      const exhaustive: never = input.kind;

      return exhaustive;
    }
  }
}
