import type {
  CreateDocumentsInput,
  DocumentOperationInput,
} from '@nevo/specflow-contracts/documents';

/** An operation as the explorer asks for it; the owner adds the `operationId`. */
export type DocumentOperation = Omit<DocumentOperationInput, 'operationId'>;

/**
 * `keepDrafts`: the action never touches the content of an open document (create, classify,
 * remove a registration), so unsaved changes are kept and nobody is asked about them.
 */
export interface BeforeActionOptions {
  keepDrafts?: boolean;
}

/** One entry of a create request (a typed document from a template, or a file with content). */
export type NewDocumentEntry = CreateDocumentsInput['documents'][number];

/** What New document sends: the path, the type and the archetype's template for it. */
export interface NewDocumentInput {
  path: string;
  type?: string;
  templateId?: string;
  /** The type's title, for the confirmation toast ("<name> added (<type>)"). */
  title?: string;
}

/** How a dialog operation ended: a failure keeps the dialog (and may return focus to the name). */
export type TypeOperationOutcome = { ok: true } | { ok: false; focusName?: boolean };

/** A move, delete or registration removal the user asked for; it runs once confirmed. */
export interface DocumentDialogRequest {
  action: 'move' | 'delete' | 'remove-registration';
  kind: 'document' | 'folder';
  id?: string;
  path: string;
  expectedRevision: string;
}

/** What the Runtime did with a submitted entry; a message is already translated for the reader. */
export type EntryOutcome = { ok: true } | { ok: false; message: string };
