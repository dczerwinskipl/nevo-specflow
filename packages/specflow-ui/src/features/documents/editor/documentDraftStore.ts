import type { EditorView } from '@codemirror/view';
import type { SpecificationDocumentResponse } from '@nevo/specflow-contracts/specs/workspace';
import { createKeyedStore, type KeyedStore } from '../../../shared/state/keyedStore';
import type { ScrollAnchor } from './documentScrollAnchor';

export interface DocumentDraft {
  content: string;
  baseline: string;
  revision: string;
  editing: boolean;
  viewState?: {
    anchor: number;
    head: number;
    scrollTop: number;
    scrollLeft: number;
    scrollSnapshot?: ReturnType<EditorView['scrollSnapshot']>;
  };
}

export const documentDraftKey = (spec: string, document: string) => `${spec}:${document}`;

/** An opened editable document defaults to Preview, not Edit; see DocumentEditor. */
export function draftFor(record: SpecificationDocumentResponse): DocumentDraft {
  return {
    content: record.content,
    baseline: record.content,
    revision: record.revision,
    editing: false,
  };
}

/** Acknowledges exactly the submitted snapshot while preserving edits made during IO. */
export function reconcileSavedDraft(
  current: DocumentDraft,
  submitted: string,
  revision: string,
): DocumentDraft {
  return { ...current, baseline: submitted, revision, editing: current.editing };
}

/**
 * Visit-scoped editing state of documents (never persisted), one entry per document. Readers
 * subscribe to a single document, so an edit, cursor or scroll update of one document does not
 * re-render consumers of another. Reading positions are kept out of reactive state (no re-render
 * per scroll).
 */
export interface DocumentDraftStore {
  get(specId: string, documentId: string): DocumentDraft | undefined;
  set(specId: string, documentId: string, draft: DocumentDraft): void;
  update(
    specId: string,
    documentId: string,
    next: (current: DocumentDraft | undefined) => DocumentDraft | undefined,
  ): void;
  /** Merges a change into the stored draft, starting from `initial()` when there is none. */
  patch(
    specId: string,
    documentId: string,
    change: Partial<DocumentDraft>,
    initial: () => DocumentDraft,
  ): void;
  remove(specId: string, documentId: string): void;
  subscribe(specId: string, documentId: string, listener: () => void): () => void;
  getAnchor(specId: string, documentId: string): ScrollAnchor | undefined;
  setAnchor(specId: string, documentId: string, anchor: ScrollAnchor): void;
}

export function createDocumentDraftStore(): DocumentDraftStore {
  const drafts: KeyedStore<DocumentDraft> = createKeyedStore();
  const anchors = new Map<string, ScrollAnchor>();
  return {
    get: (s, d) => drafts.get(documentDraftKey(s, d)),
    set: (s, d, draft) => drafts.set(documentDraftKey(s, d), draft),
    update: (s, d, next) => drafts.update(documentDraftKey(s, d), next),
    patch: (s, d, change, initial) =>
      drafts.update(documentDraftKey(s, d), (current) => ({
        ...(current ?? initial()),
        ...change,
      })),
    remove: (s, d) => drafts.remove(documentDraftKey(s, d)),
    subscribe: (s, d, listener) => drafts.subscribe(documentDraftKey(s, d), listener),
    getAnchor: (s, d) => anchors.get(documentDraftKey(s, d)),
    setAnchor: (s, d, anchor) => void anchors.set(documentDraftKey(s, d), anchor),
  };
}
