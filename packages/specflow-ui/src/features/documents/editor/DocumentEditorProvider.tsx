import type { ActionReason, DocumentContent } from '@nevo/specflow-contracts/documents';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
} from '@nevo/ui';
import { useAppServices } from '../../../app/useAppServices';
import { useAnnouncer } from '../../../shared/a11y/useAnnouncer';
import { apiErrorCode } from '../../../shared/http/apiErrorCode';
import { downloadDocument } from '../content/DocumentFileViews';
import { documentKeys } from '../read-model/queries';
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
import { documentDraftKey, draftFor, isDraftDirty, type DocumentDraft } from './documentDraftStore';
import { useDocumentDraft, useDocumentDraftStore } from './DocumentDraftProvider';
import { UnsavedChangesDialog } from './UnsavedChangesDialog';
import { DocumentPathDialog } from './DocumentPathDialog';
import { hasTextDraft, kindIdOf } from '../content-kinds/kindId';
import {
  documentOutline,
  type DocumentOutlineData,
  type OutlineNavigator,
} from '../outline/outlineData';
import { DocumentOutlineSheet } from '../outline/DocumentOutlineSheet';
import { regionHeading } from '../outline/regionHeading';
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
  document: DocumentContent;
  draft: DocumentDraft;
  dirty: boolean;
  saving: boolean;
  saveError?: unknown;
  setDraft: (change: Partial<DocumentDraft>) => void;
  toggleEditing: () => void;
  save: (options?: { restoreFocus?: boolean }) => Promise<boolean>;
  /** Asks to discard unsaved edits; clean drafts need no confirmation. */
  requestDiscard: () => void;
  /**
   * Why the document opens read-only (design order: archived, Git policy, branch, commit, not
   * editable, not implemented); undefined when it can be edited. No Edit is offered then.
   */
  readOnlyReason?: ActionReason;
  /** A save was written but not committed: editing is locked until it is resumed. */
  locked: boolean;
  /** Save would only repeat a refusal (conflict not resolved, read-only, locked). */
  saveBlocked: boolean;
  /** Resumes the save that was written but not committed (same operation id). */
  resume: () => void;
  /** Conflict: puts the user's text on the clipboard and loads the version on disk as the base. */
  copyMine: () => void;
  /** Conflict: asks to discard the draft and load the version on disk. */
  requestLoadDisk: () => void;
  /** An image is shown at its actual size instead of fitted to the area. */
  actualSize: boolean;
  toggleActualSize: () => void;
  /** Downloads the document's bytes (images and files that cannot be shown). */
  download: () => void;
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
  /** Headings and properties of the text, parsed once per change. */
  outline: DocumentOutlineData;
  /** The mounted preview registers how to scroll to a heading and which one the reader is at. */
  outlineNavigator: MutableRefObject<OutlineNavigator | null>;
  /** The preview reports whether its panel shows the contents in a column (undefined: no preview). */
  reportColumnShown: (shown: boolean | undefined) => void;
  /**
   * The contents can be opened as a sheet: previewing markdown with at least two headings in a panel
   * that has no contents column. The header icon and the menu item exist exactly then.
   */
  outlineAvailable: boolean;
  outlineOpen: boolean;
  openOutline: () => void;
}

const Context = createContext<DocumentEditorSession | null>(null);
const SaveOwnerContext = createContext<DocumentSaveOwner | null>(null);

/** One workspace-scoped save owner, available even while no document is shown. */
export function useDocumentSaveOwner(): DocumentSaveOwner {
  const owner = useContext(SaveOwnerContext);
  if (!owner) throw new Error('Document save owner missing');
  return owner;
}

/** The edit session of the document on screen, if it is loaded. */
export function useDocumentEditor() {
  return useContext(Context);
}

/**
 * The session of one document: the shown document's, or null for any other (a tab that is not
 * on screen has a draft in the store but no mounted session).
 */
export function useDocumentSession(documentId: string): DocumentEditorSession | null {
  const session = useContext(Context);
  return session?.document.id === documentId ? session : null;
}

export function DocumentEditorProvider({
  specId,
  document,
  readOnlyReason,
  children,
}: {
  specId: string;
  /** Undefined while the document is loading or unavailable. */
  document?: DocumentContent;
  /** Why the document cannot be edited (from the tree and the record); undefined when it can. */
  readOnlyReason?: ActionReason;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const store = useDocumentDraftStore();
  const cache = useQueryClient();
  const { documentApi } = useAppServices();
  const { announce, region } = useAnnouncer();
  // Images shown at their actual size (by document); fitted to the area otherwise.
  const [actualSizeOf, setActualSizeOf] = useState<readonly string[]>([]);
  // The document whose "Load the version on disk" question is open.
  const [loadDiskFor, setLoadDiskFor] = useState<string>();
  const anchorReader = useRef<(() => ScrollAnchor | undefined) | null>(null);
  const focusAfterDiscard = useRef(false);
  const [guardFor, setGuardFor] = useState<string>();
  const [pathOpen, setPathOpen] = useState(false);
  const outlineNavigator = useRef<OutlineNavigator | null>(null);
  // Reported by the mounted preview, which alone can measure its panel: an exception to deriving
  // state in the owner, kept as one boolean the header reads.
  const [columnShown, setColumnShown] = useState<boolean>();
  // The document the contents sheet was opened for; the sheet is open only while that still holds.
  const [openedFor, setOpenedFor] = useState<string>();
  // The heading the reader was at when the sheet opened: measured once, at that moment.
  const [outlineActive, setOutlineActive] = useState<number>();
  const documentId = document?.id ?? '';
  const key = documentDraftKey(specId, documentId);
  const stored = useDocumentDraft(specId, documentId);
  // Images and files that cannot be shown have no text: a view-only draft that is never stored.
  const textDocument = document ? hasTextDraft(document) : false;
  const draft = (textDocument ? stored : undefined) ?? (document ? draftFor(document) : undefined);
  // Event-time reads of the committed document/draft; never used for the identity of a save result.
  const shown = useRef({ specId, key, document, draft });
  useLayoutEffect(() => {
    shown.current = { specId, key, document, draft };
  });
  const markdown = kindIdOf(document?.path) === 'markdown';
  const content = draft?.content ?? '';
  const outline = useMemo(() => documentOutline(content, markdown), [content, markdown]);
  const outlineAvailable =
    markdown && draft?.editing === false && columnShown === false && outline.headings.length > 0;
  const outlineOpen = openedFor !== undefined && openedFor === documentId && outlineAvailable;
  // Editing, a wide panel or another document ends the question, so coming back never reopens it.
  if (openedFor !== undefined && !outlineOpen) setOpenedFor(undefined);
  const outlineOpener = useRef<HTMLElement | null>(null);
  const openOutline = useCallback(() => {
    outlineOpener.current =
      globalThis.document.activeElement instanceof HTMLElement
        ? globalThis.document.activeElement
        : null;
    setOutlineActive(outlineNavigator.current?.activeLine());
    setOpenedFor(documentId);
  }, [documentId]);
  const owner = useDocumentSave({ specId, document, draft });
  const { save: saveOwned } = owner;

  const { editorRoot, focusEditor, focusContent, focusEditorSoon, focusContentSoon } =
    useEditorFocus();
  const setDraft = useCallback(
    (change: Partial<DocumentDraft>) => {
      const { document: record } = shown.current;
      if (!record || !hasTextDraft(record)) return;
      store.patch(shown.current.specId, record.id, change, () => draftFor(record));
    },
    [store],
  );
  const save = useCallback(
    async (options?: { restoreFocus?: boolean }) => {
      // A slow commit is announced once, after a second; the result is announced when it comes.
      const slow = setTimeout(() => announce(t('documents.save.committing')), 1000);
      const result = await saveOwned().finally(() => clearTimeout(slow));
      if (!result?.ok) return false;
      if (result.committed !== undefined)
        announce(result.committed ? t('documents.save.committed') : t('documents.save.saved'));
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
    [saveOwned, focusEditorSoon, announce, t],
  );
  const { clearError } = owner;
  /** Replaces the draft of the shown document with the version on disk (the new base). */
  const loadDisk = useCallback(async () => {
    const { specId: openSpec, document: open, draft: openDraft } = shown.current;
    if (!open) return false;
    try {
      const fresh = await documentApi.getDocument(openSpec, open.id);
      cache.setQueryData(documentKeys.detail(openSpec, open.id), fresh);
      store.set(openSpec, open.id, {
        ...draftFor(fresh),
        editing: openDraft?.editing ?? false,
      });
      clearError(open.id);
      return true;
    } catch {
      announce(t('documents.conflict.loadFailed'));
      return false;
    }
  }, [documentApi, cache, store, clearError, announce, t]);
  const copyMine = useCallback(() => {
    const content = shown.current.draft?.content ?? '';
    void (async () => {
      try {
        if (!navigator.clipboard) throw new Error('Clipboard is unavailable');
        await navigator.clipboard.writeText(content);
      } catch {
        announce(t('documents.conflict.copyFailed'));
        return;
      }
      if (await loadDisk()) announce(t('documents.conflict.copied'));
    })();
  }, [loadDisk, announce, t]);
  const requestLoadDisk = useCallback(() => {
    const { document: open } = shown.current;
    if (open) setLoadDiskFor(open.id);
  }, []);
  const resume = useCallback(() => void save(), [save]);
  const toggleActualSize = useCallback(() => {
    const { document: open } = shown.current;
    if (!open) return;
    setActualSizeOf((ids) =>
      ids.includes(open.id) ? ids.filter((id) => id !== open.id) : [...ids, open.id],
    );
  }, []);
  const download = useCallback(() => {
    const { specId: openSpec, document: open } = shown.current;
    if (!open) return;
    downloadDocument(openSpec, open);
  }, []);
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

  const saveCode = apiErrorCode(owner.saveError);
  const locked = saveCode === 'DOCUMENT_RECOVERY_REQUIRED';
  const session = useMemo<DocumentEditorSession | null>(() => {
    if (!document || !draft) return null;
    return {
      specId,
      document,
      draft,
      dirty: textDocument && isDraftDirty(draft),
      saving: owner.saving,
      saveError: owner.saveError,
      readOnlyReason,
      locked,
      saveBlocked:
        locked || saveCode === 'DOCUMENT_REVISION_CONFLICT' || readOnlyReason !== undefined,
      resume,
      copyMine,
      requestLoadDisk,
      actualSize: actualSizeOf.includes(document.id),
      toggleActualSize,
      download,
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
      outline,
      outlineNavigator,
      reportColumnShown: setColumnShown,
      outlineAvailable,
      outlineOpen,
      openOutline,
    };
  }, [
    specId,
    document,
    draft,
    store,
    owner.saving,
    owner.saveError,
    textDocument,
    readOnlyReason,
    locked,
    saveCode,
    resume,
    copyMine,
    requestLoadDisk,
    actualSizeOf,
    toggleActualSize,
    download,
    setDraft,
    toggleEditing,
    save,
    requestDiscard,
    showPath,
    editorRoot,
    focusEditor,
    focusContent,
    rememberAnchor,
    outline,
    outlineAvailable,
    outlineOpen,
    openOutline,
  ]);

  const name = document?.path ?? '';
  return (
    <SaveOwnerContext.Provider value={owner}>
      <Context.Provider value={session}>
        {children}
        {region}
        {session && (
          <AlertDialog
            open={loadDiskFor !== undefined && loadDiskFor === document?.id}
            onOpenChange={(next) => {
              if (!next) setLoadDiskFor(undefined);
            }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('documents.conflict.loadTitle')}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t('documents.conflict.loadBody', { name })}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel asChild>
                  <Button variant="secondary">{t('common.cancel')}</Button>
                </AlertDialogCancel>
                <Button
                  variant="destructive"
                  onClick={() =>
                    void loadDisk().then((loaded) => {
                      if (loaded) setLoadDiskFor(undefined);
                    })
                  }
                >
                  {t('documents.conflict.loadConfirm')}
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
        {session && <DocumentPathDialog open={pathOpen} path={name} onOpenChange={setPathOpen} />}
        {session && (
          <DocumentOutlineSheet
            open={outlineOpen}
            headings={outline.headings}
            activeLine={outlineActive}
            onOpenChange={(next) => {
              if (!next) setOpenedFor(undefined);
            }}
            onSelected={(line, pointer) => outlineNavigator.current?.goTo(line, pointer)}
            restoreFocusTo={() =>
              // A menu item that opened the sheet is gone by now: the document heading is the next best place.
              outlineOpener.current?.isConnected ? outlineOpener.current : regionHeading()
            }
          />
        )}
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
