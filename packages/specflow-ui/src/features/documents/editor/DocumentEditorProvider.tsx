import { useTranslation } from 'react-i18next';
import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from 'react';
import type { SpecificationDocumentResponse } from '@nevo/specflow-contracts/specs/workspace';
import { documentDraftKey, draftFor, isDraftDirty, type DocumentDraft } from './documentDraftStore';
import { useDocumentDraft, useDocumentDraftStore } from './DocumentDraftProvider';
import { UnsavedChangesDialog } from './UnsavedChangesDialog';
import { DocumentPathDialog } from './DocumentPathDialog';
import type { ScrollAnchor } from './documentScrollAnchor';
import { useDocumentSave, type DocumentSaveOwner } from './useDocumentSave';
import { useEditorFocus } from './useEditorFocus';

/**
 * One owner of the open document's edit session (draft, save, discard guard). The workspace
 * header carries its actions and the pane renders its content, so the document has one header
 * and one source of truth for dirty/saving state, whichever pane or stack renders it.
 */
export interface DocumentEditorSession {
  specId: string;
  document: SpecificationDocumentResponse;
  draft: DocumentDraft;
  dirty: boolean;
  saving: boolean;
  saveError?: unknown;
  setDraft: (change: Partial<DocumentDraft>) => void;
  toggleEditing: () => void;
  save: (options?: { restoreFocus?: boolean }) => Promise<boolean>;
  /** Asks to discard unsaved edits; clean drafts need no confirmation. */
  requestDiscard: () => void;
  /** Opens the dialog with the document's full path (header overflow action). */
  showPath: () => void;
  editorRoot: MutableRefObject<HTMLDivElement | null>;
  focusEditor: () => void;
  /** Moves focus into the current content (source editor or preview) after a mode change. */
  focusContent: () => void;
  /** The shared reading position of this document for the visit (source and preview). */
  anchor?: ScrollAnchor;
  rememberAnchor: (anchor: ScrollAnchor) => void;
  /** The mounted content view registers a synchronous reader of its current position. */
  anchorReader: MutableRefObject<(() => ScrollAnchor | undefined) | null>;
}

const Context = createContext<DocumentEditorSession | null>(null);
const SaveOwnerContext = createContext<DocumentSaveOwner | null>(null);

/** One workspace-scoped save owner, available even while no document is shown. */
export function useDocumentSaveOwner(): DocumentSaveOwner {
  const owner = useContext(SaveOwnerContext);
  if (!owner) throw new Error('Document save owner missing');
  return owner;
}

export function useDocumentEditor() {
  return useContext(Context);
}

export function DocumentEditorProvider({
  specId,
  document,
  children,
}: {
  specId: string;
  /** Undefined while the document is loading or unavailable. */
  document?: SpecificationDocumentResponse;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const store = useDocumentDraftStore();
  const anchorReader = useRef<(() => ScrollAnchor | undefined) | null>(null);
  const focusAfterDiscard = useRef(false);
  const [guardFor, setGuardFor] = useState<string>();
  const [pathOpen, setPathOpen] = useState(false);
  const documentId = document?.id ?? '';
  const key = documentDraftKey(specId, documentId);
  const stored = useDocumentDraft(specId, documentId);
  const draft = stored ?? (document ? draftFor(document) : undefined);
  // Event-time reads of the committed document/draft; never used for the identity of a save result.
  const shown = useRef({ specId, key, document, draft });
  useLayoutEffect(() => {
    shown.current = { specId, key, document, draft };
  });
  const owner = useDocumentSave({ specId, document, draft });
  const { save: saveOwned } = owner;

  const { editorRoot, focusEditor, focusContent, focusEditorSoon, focusContentSoon } =
    useEditorFocus();
  const setDraft = useCallback(
    (change: Partial<DocumentDraft>) => {
      const { document: record } = shown.current;
      if (!record) return;
      store.patch(shown.current.specId, record.id, change, () => draftFor(record));
    },
    [store],
  );
  const save = useCallback(
    async (options?: { restoreFocus?: boolean }) => {
      const result = await saveOwned();
      if (!result?.ok) return false;
      // Only the document still on screen is affected by what happens after the response.
      const open = shown.current;
      if (open.key !== documentDraftKey(result.specId, result.documentId)) return true;
      if (options?.restoreFocus) {
        // The header action that triggered the save is disabled once the draft is clean.
        const active = globalThis.document.activeElement;
        if (
          !active ||
          active === globalThis.document.body ||
          active.closest('[data-workspace-header]')
        )
          focusEditorSoon();
      }
      return open.draft?.content === result.content;
    },
    [saveOwned, focusEditorSoon],
  );
  const toggleEditing = useCallback(() => {
    const { specId: openSpec, document: openDocument, draft: openDraft } = shown.current;
    if (!openDraft || !openDocument) return;
    // Read the position first: hiding the keyboard or swapping the view changes the geometry.
    const position = anchorReader.current?.();
    if (position) store.setAnchor(openSpec, openDocument.id, position);
    const active = globalThis.document.activeElement;
    if (active instanceof HTMLElement && editorRoot.current?.contains(active)) active.blur();
    setDraft({ editing: !openDraft.editing });
    // Wait for the mode switch to render before moving focus into its content.
    focusContentSoon();
  }, [store, setDraft, focusContentSoon, editorRoot]);
  const requestDiscard = useCallback(() => {
    const { document: open, draft: openDraft } = shown.current;
    if (open && openDraft && isDraftDirty(openDraft)) setGuardFor(open.id);
  }, []);
  const showPath = useCallback(() => setPathOpen(true), []);
  const rememberAnchor = useCallback(
    (next: ScrollAnchor) => {
      const { specId: openSpec, document: open } = shown.current;
      if (open) store.setAnchor(openSpec, open.id, next);
    },
    [store],
  );

  const session = useMemo<DocumentEditorSession | null>(() => {
    if (!document || !draft) return null;
    return {
      specId,
      document,
      draft,
      dirty: isDraftDirty(draft),
      saving: owner.saving,
      saveError: owner.saveError,
      setDraft,
      toggleEditing,
      save,
      requestDiscard,
      showPath,
      editorRoot,
      focusEditor,
      focusContent,
      anchor: document ? store.getAnchor(specId, document.id) : undefined,
      rememberAnchor,
      anchorReader,
    };
  }, [
    specId,
    document,
    draft,
    store,
    owner.saving,
    owner.saveError,
    setDraft,
    toggleEditing,
    save,
    requestDiscard,
    showPath,
    editorRoot,
    focusEditor,
    focusContent,
    rememberAnchor,
  ]);

  const name = document?.filename ?? document?.title ?? '';
  return (
    <SaveOwnerContext.Provider value={owner}>
      <Context.Provider value={session}>
        {children}
        {session && <DocumentPathDialog open={pathOpen} path={name} onOpenChange={setPathOpen} />}
        {session && (
          <UnsavedChangesDialog
            open={guardFor === document?.id}
            description={t('documents.dialogs.unsaved.discardDescription', { name })}
            saveLabel={t('documents.dialogs.unsaved.save')}
            pending={session.saving}
            onContinue={() => setGuardFor(undefined)}
            onDiscard={() => {
              focusAfterDiscard.current = true;
              session.setDraft({ content: session.draft.baseline, editing: true });
              setGuardFor(undefined);
            }}
            onSave={() =>
              void session.save().then((saved) => {
                if (saved) setGuardFor(undefined);
              })
            }
            onCloseAutoFocus={(event) => {
              if (focusAfterDiscard.current) {
                event.preventDefault();
                focusAfterDiscard.current = false;
                focusEditorSoon();
              }
            }}
          />
        )}
      </Context.Provider>
    </SaveOwnerContext.Provider>
  );
}
