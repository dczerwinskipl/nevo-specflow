import type {
  DocumentOperationResult,
  DocumentTree as Tree,
} from '@nevo/specflow-contracts/documents';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import {
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type Ref,
  type RefObject,
} from 'react';
import {
  Alert,
  Button,
  Spinner,
  TooltipProvider,
  Typography,
  treeSectionHeaderClassName,
  type WorkspaceHeaderAction,
} from '@nevo/ui';
import type { CatalogueState } from './DocumentTypeDialogs';
import { AssignTypeDialog, NewDocumentDialog } from './DocumentTypeDialogs';
import { DocumentImporter, type DocumentImporterHandle } from './DocumentImporter';
import { DocumentNodeMenu, type DocumentNodeActions } from './DocumentNodeMenu';
import { DocumentOperationDialogs } from './DocumentOperationDialogs';
import { DocumentTreeLevel } from './DocumentTreeLevel';
import { InlineEntryEditor } from './InlineEntryEditor';
import { createTreeIndex, folderOperationRevision, treeRows } from './documentTreePolicy';
import {
  useDocumentOperations,
  type DocumentDialogRequest,
  type DocumentOperation,
  type BeforeActionOptions,
  type NewDocumentEntry,
} from './useDocumentOperations';
import { useInlineEntry } from './useInlineEntry';
import { useDelayedFlag } from './useDelayedFlag';
import { useTreeFocus } from './useTreeFocus';

export type { DocumentOperation } from './useDocumentOperations';

interface Props {
  tree: Tree;
  /** Type titles, `useWhen` and instructions for the labels and the type chooser. */
  catalogue?: CatalogueState;
  /** The Specification's name ("In the main folder of <specification>"). */
  specificationTitle?: string;
  active?: string;
  onSelect: (id: string) => void;
  onAdd: (documents: NewDocumentEntry[], folders?: string[]) => Promise<void>;
  onOperate: (input: DocumentOperation) => Promise<DocumentOperationResult | void>;
  /** Reads the tree again after a refusal that means it is stale or read-only now. */
  onRefresh?: () => Promise<unknown>;
  /** Documents with unsaved changes (Remove registration says the changes will be lost). */
  dirtyIds?: readonly string[];
  beforeAction?: (options?: BeforeActionOptions) => Promise<Tree | false>;
  onBusyChange?: (busy: boolean) => void;
  /** Root-level creation lives in the workspace header menu; it drives the tree through this handle. */
  controllerRef?: Ref<DocumentTreeController>;
}
export interface DocumentTreeController {
  create: (kind: 'document' | 'folder') => void;
  /** Opens New document in the main folder, with `type` selected (Expected documents Add). */
  newDocument: (type?: string) => void;
  /** Opens Assign type for an unclassified document (also from its tab). */
  assignType: (id: string) => void;
  /** Asks to remove the registration of a dangling entry (also from its missing tab). */
  removeRegistration: (id: string) => void;
  upload: () => void;
  /**
   * The header menu that started `create` has closed (it hands focus to the tree instead of
   * returning it to its trigger): the inline input takes focus.
   */
  menuClosed: () => void;
}
/** Root-level actions (the tree has no root row): they live in the header menu and drive the tree. */
export function documentRootActions(
  controller: RefObject<DocumentTreeController | null>,
  capabilities: Tree['capabilities'] | undefined,
  busy: boolean,
  t: TFunction,
): WorkspaceHeaderAction[] {
  return [
    {
      id: 'documents-new-file',
      label: t('documents.tree.newDocument'),
      icon: 'file',
      disabled: !capabilities?.createFile.available || busy,
      onPress: () => controller.current?.newDocument(),
    },
    {
      id: 'documents-new-folder',
      label: t('documents.tree.newFolder'),
      icon: 'folder',
      disabled: !capabilities?.createFolder.available || busy,
      onPress: () => controller.current?.create('folder'),
      onMenuClosed: () => controller.current?.menuClosed(),
    },
    {
      id: 'documents-upload',
      label: t('documents.tree.upload'),
      icon: 'upload',
      disabled: !capabilities?.import.available || busy,
      onPress: () => controller.current?.upload(),
    },
  ];
}

/** Without a catalogue the labels show type ids and the chooser offers only "No type". */
const noCatalogue: CatalogueState = { isPending: false, retry: () => undefined };

/** The New document or Assign type dialog that is open; `key` makes each open a fresh dialog. */
type TypeRequest =
  | { kind: 'new'; folder: string; type?: string; key?: string }
  | { kind: 'classify'; id: string; path: string; expectedRevision: string; key?: string };

let dialogSequence = 0;
const newKey = () => `type-dialog-${++dialogSequence}`;

const toggled = (values: readonly string[], value: string) =>
  values.includes(value) ? values.filter((item) => item !== value) : [...values, value];

/**
 * Folder context owns creation; pending names never masquerade as committed manifest entries.
 * The container wires the pieces: which folders are open, the inline entry, the operations, the
 * importer and the move/delete dialogs.
 */
export function DocumentsExplorer({
  tree,
  catalogue = noCatalogue,
  specificationTitle = '',
  active,
  onSelect,
  onAdd,
  onOperate,
  onRefresh,
  dirtyIds,
  beforeAction,
  onBusyChange,
  controllerRef,
}: Props) {
  const { t } = useTranslation();
  const noteBase = useId();
  const rootHeadingId = useId();
  const [closed, setClosed] = useState<string[]>([]),
    // Empty folders start collapsed; the hint shows only for those the user opened.
    [openedEmpty, setOpenedEmpty] = useState<string[]>([]),
    [request, setRequest] = useState<DocumentDialogRequest>(),
    // New document / Assign type: the dialog that is open (each open is a fresh dialog).
    [typeRequest, setTypeRequest] = useState<TypeRequest>(),
    [target, setTarget] = useState('');
  const importer = useRef<DocumentImporterHandle>(null);
  // Focus return of the dialogs (see `rememberOpener`).
  const opener = useRef<HTMLElement | null>(null);
  const closedByResult = useRef(false);

  const operations = useDocumentOperations({
    tree,
    onAdd,
    onOperate,
    onRefresh,
    beforeAction,
    onBusyChange,
  });
  const { busy, unknown, error, retry, resumable } = operations.state;
  // A running operation shows a small spinner in the root header, only once it takes a while.
  const working = useDelayedFlag(busy);
  const index = useMemo(() => createTreeIndex(treeRows(tree)), [tree]);
  const focus = useTreeFocus(index);
  const inline = useInlineEntry({
    operations: operations.actions,
    focus,
    onOpenFolder: (folder) => setClosed((value) => value.filter((path) => path !== folder)),
  });

  const noteId = (kind: string, path: string) =>
    `${noteBase}-note-${kind}-${path.replace(/[^\p{L}\p{N}_-]/gu, '_')}`;
  const select = (id: string) => {
    if (operations.actions.canSelect()) onSelect(id);
  };
  const parentOf = (path: string) =>
    path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
  // These actions never change an open document's text: its draft stays, nobody is asked.
  const keepDrafts = { keepDrafts: true };
  /**
   * Remembers where focus goes back when a dialog closes without a result: the control that opened
   * it (Add, a row's menu trigger, the tab's button). A dialog opened from the header menu returns
   * to the tree instead. Written in event handlers only.
   */
  const rememberOpener = () => {
    const active = globalThis.document.activeElement;
    opener.current =
      active instanceof HTMLElement &&
      active !== globalThis.document.body &&
      !active.closest('[data-workspace-header]')
        ? active
        : null;
  };
  const restoreOpener = () =>
    requestAnimationFrame(() => {
      if (opener.current?.isConnected) opener.current.focus();
      else focus.request('folder:');
      opener.current = null;
    });
  const openTypeDialog = (next: TypeRequest) =>
    void operations.actions.guard(() => {
      rememberOpener();
      operations.actions.clearError();
      setTypeRequest({ ...next, key: newKey() });
    }, keepDrafts);
  /** The row after `id` in its level (focus goes there when the row disappears). */
  const rowAfter = (path: string, id: string) => {
    const level = index.level(parentOf(path));
    const at = level.documents.findIndex((doc) => doc.id === id);
    const next = level.documents[at + 1] ?? level.documents[at - 1];
    return next ? 'doc:' + next.id : 'folder:';
  };
  const requestDialog =
    (action: 'move' | 'delete') => (kind: 'document' | 'folder', path: string, id?: string) =>
      void operations.actions.guard((snapshot) => {
        const document =
          kind === 'document' ? snapshot.documents.find((doc) => doc.id === id) : undefined;
        // A document sends its own revision, a folder the FOLDER revision (never the tree's).
        const expectedRevision =
          kind === 'document' ? document?.revision : folderOperationRevision(snapshot, path);
        if (!expectedRevision) return;
        if (action === 'move') setTarget('');
        setRequest({ action, kind, path: document?.path ?? path, id, expectedRevision });
      });
  const nodeActions: DocumentNodeActions = {
    create: (kind, parent) => inline.start(kind, parent),
    newDocument: (folder) => openTypeDialog({ kind: 'new', folder }),
    classify: (id) =>
      void operations.actions.guard((snapshot) => {
        const document = snapshot.documents.find((doc) => doc.id === id);
        // Offered only where the Runtime can classify (never in a Runtime without the write).
        if (
          !document ||
          !document.actions.classify.available ||
          !snapshot.capabilities.classify.available
        )
          return;
        rememberOpener();
        operations.actions.clearError();
        setTypeRequest({
          kind: 'classify',
          id,
          path: document.path,
          expectedRevision: document.revision,
          key: newKey(),
        });
      }, keepDrafts),
    removeRegistration: (id) =>
      void operations.actions.guard((snapshot) => {
        const entry = snapshot.dangling.find((candidate) => candidate.id === id);
        if (!entry?.actions.delete.available) return;
        rememberOpener();
        operations.actions.clearError();
        // A dangling entry has no revision of its own: the tree revision guards it.
        setRequest({
          action: 'remove-registration',
          kind: 'document',
          id,
          path: entry.path,
          expectedRevision: snapshot.revision,
        });
      }, keepDrafts),
    importInto: (folder) => void operations.actions.guard(() => importer.current?.choose(folder)),
    rename: (kind, path, id) => inline.start(kind, parentOf(path), { id, path }),
    move: requestDialog('move'),
    remove: requestDialog('delete'),
    restoreEntryFocus: inline.focusInput,
  };

  const closeTypeDialog = () => {
    operations.actions.clearError();
    setTypeRequest(undefined);
    // The dialog unmounts: its own focus restoration cannot run, so the opener gets focus here.
    restoreOpener();
  };

  useImperativeHandle(controllerRef, () => ({
    create: (kind) => inline.beginFromMenu(kind),
    newDocument: (type) => openTypeDialog({ kind: 'new', folder: '', type }),
    assignType: nodeActions.classify,
    removeRegistration: nodeActions.removeRegistration,
    menuClosed: inline.menuClosed,
    upload: () => void operations.actions.guard(() => importer.current?.choose('')),
  }));

  return (
    <TooltipProvider delayDuration={400}>
      <div className="grid min-w-0 gap-1" aria-busy={busy || undefined}>
        {/* The root of the tree is a section header (no chevron, never collapses). */}
        <div className={treeSectionHeaderClassName}>
          <Typography
            as="h2"
            id={rootHeadingId}
            variant="section-label"
            className="min-w-0 flex-1 truncate text-content-muted"
          >
            {t('documents.tree.rootTitle')}
          </Typography>
          {working && <Spinner size="sm" data-testid="documents-tree-busy" />}
        </div>
        <DocumentTreeLevel
          parent=""
          top
          labelledBy={rootHeadingId}
          context={{
            index,
            catalogue: catalogue.data,
            active,
            locked: busy || unknown,
            closed,
            openedEmpty,
            entry: inline.entry,
            renderEntry: (entry, flat) => (
              <InlineEntryEditor
                key={entry.key}
                entry={entry}
                flat={flat}
                busy={busy}
                unknown={unknown}
                inputRef={inline.inputRef}
                onChange={inline.change}
                onBlur={inline.blur}
                onEnter={() => void inline.commit('enter')}
                onEscape={inline.cancel}
                onCheckResult={() => void inline.commit('retry')}
              />
            ),
            renderMenu: (kind, path, id) => (
              <DocumentNodeMenu
                tree={tree}
                kind={kind}
                path={path}
                id={id}
                locked={busy || unknown}
                noteId={noteId(kind, path)}
                actions={nodeActions}
              />
            ),
            register: focus.register,
            hintId: (path) => noteId('empty', path),
            onToggleFolder: (path, empty) =>
              empty
                ? setOpenedEmpty((value) => toggled(value, path))
                : setClosed((value) => toggled(value, path)),
            onOpen: select,
          }}
        />
        {!tree.documents.length && !tree.dangling.length && (
          <p className="text-body-sm text-content-muted">{t('documents.tree.addFirst')}</p>
        )}
        {tree.skippedEntries > 0 && (
          // Neutral information: an entry the Runtime could not read is not a Close refusal.
          <p className="px-2 text-body-sm text-content-muted">
            {t('documents.tree.skipped', { count: tree.skippedEntries })}
          </p>
        )}
        {tree.truncated && (
          <p className="px-2 text-body-sm text-content-muted">{t('documents.tree.truncated')}</p>
        )}

        {error && !request && !typeRequest && (
          <Alert tone="attention" title={error}>
            {retry.length > 0 && (
              <Button disabled={busy} onClick={operations.actions.retryImport}>
                {resumable ? t('documents.tree.error.resume') : t('documents.tree.retryImport')}
              </Button>
            )}
          </Alert>
        )}
        <DocumentImporter
          formats={tree.capabilities.formats}
          handleRef={importer}
          onFiles={operations.actions.importFiles}
        />
        <DocumentOperationDialogs
          tree={tree}
          request={request}
          target={target}
          busy={busy}
          unknown={unknown}
          error={error}
          resumable={resumable}
          dirtyIds={dirtyIds}
          onTargetChange={setTarget}
          onConfirm={() => {
            if (!request) return;
            const after =
              request.action === 'remove-registration' && request.id
                ? rowAfter(request.path, request.id)
                : undefined;
            void operations.actions.confirmDialog(request, target, () => {
              // The result decides where focus goes (the next row), not the opener.
              if (after) {
                opener.current = null;
                closedByResult.current = true;
                focus.request(after);
              }
              setRequest(undefined);
            });
          }}
          onClose={() => {
            operations.actions.clearError();
            setRequest(undefined);
          }}
          onCloseAutoFocus={(event) => {
            // Only the dialogs that remembered their opener decide focus; the others keep Radix's.
            if (!opener.current && !closedByResult.current) return;
            event.preventDefault();
            if (!closedByResult.current) restoreOpener();
            closedByResult.current = false;
          }}
        />
        {typeRequest?.kind === 'new' && (
          <NewDocumentDialog
            key={typeRequest.key}
            tree={tree}
            catalogue={catalogue}
            specificationTitle={specificationTitle}
            request={typeRequest}
            busy={busy}
            unknown={unknown}
            error={error ? { message: error, resume: resumable } : undefined}
            onClose={closeTypeDialog}
            onSubmit={(input) =>
              operations.actions.createDocument(input, () => {
                // Focus moves into the new document's tab (the tree operations do that).
                opener.current = null;
                setTypeRequest(undefined);
              })
            }
          />
        )}
        {typeRequest?.kind === 'classify' && (
          <AssignTypeDialog
            key={typeRequest.key}
            tree={tree}
            catalogue={catalogue}
            request={typeRequest}
            busy={busy}
            unknown={unknown}
            error={error ? { message: error, resume: resumable } : undefined}
            onClose={closeTypeDialog}
            onSubmit={(type, title) =>
              operations.actions.classify(typeRequest, type, title, (id) => {
                opener.current = null;
                setTypeRequest(undefined);
                // Focus stays on the row, now under its new id.
                focus.request('doc:' + (id ?? typeRequest.id));
              })
            }
          />
        )}
      </div>
    </TooltipProvider>
  );
}
