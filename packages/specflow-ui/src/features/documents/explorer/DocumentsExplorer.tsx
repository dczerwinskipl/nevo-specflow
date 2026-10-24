import type {
  DocumentOperationResult,
  DocumentTree as Tree,
} from '@nevo/specflow-contracts/documents';
import { Upload } from 'lucide-react';
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
import { Alert, Button, TooltipProvider, type WorkspaceHeaderAction } from '@nevo/ui';
import type { CatalogueState } from './DocumentTypeDialogs';
import { AssignTypeDialog, NewDocumentDialog } from './DocumentTypeDialogs';
import { DocumentImporter, type DocumentImporterHandle } from './DocumentImporter';
import { DocumentNodeMenu, type DocumentNodeActions } from './DocumentNodeMenu';
import { DocumentOperationDialogs } from './DocumentOperationDialogs';
import { DocumentTreeLevel } from './DocumentTreeLevel';
import { InlineEntryEditor } from './InlineEntryEditor';
import { createTreeIndex, treeRows } from './documentTreePolicy';
import {
  useDocumentOperations,
  type DocumentDialogRequest,
  type DocumentOperation,
  type BeforeActionOptions,
  type NewDocumentEntry,
} from './useDocumentOperations';
import { useInlineEntry } from './useInlineEntry';
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
      icon: Upload,
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
  beforeAction,
  onBusyChange,
  controllerRef,
}: Props) {
  const { t } = useTranslation();
  const noteBase = useId();
  const [closed, setClosed] = useState<string[]>([]),
    // Empty folders start collapsed; the hint shows only for those the user opened.
    [openedEmpty, setOpenedEmpty] = useState<string[]>([]),
    [request, setRequest] = useState<DocumentDialogRequest>(),
    // New document / Assign type: the dialog that is open (each open is a fresh dialog).
    [typeRequest, setTypeRequest] = useState<TypeRequest>(),
    [target, setTarget] = useState('');
  const importer = useRef<DocumentImporterHandle>(null);

  const operations = useDocumentOperations({
    tree,
    onAdd,
    onOperate,
    onRefresh,
    beforeAction,
    onBusyChange,
  });
  const { busy, unknown, error, notice, retry, resumable } = operations.state;
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
  const openTypeDialog = (next: TypeRequest) =>
    void operations.actions.guard(() => {
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
        const document = id ? snapshot.documents.find((doc) => doc.id === id) : undefined;
        if (action === 'move') setTarget('');
        setRequest({
          action,
          kind,
          path: document?.path ?? path,
          id,
          expectedRevision: document?.revision ?? snapshot.revision,
        });
      });
  const nodeActions: DocumentNodeActions = {
    create: (kind, parent) => inline.start(kind, parent),
    newDocument: (folder) => openTypeDialog({ kind: 'new', folder }),
    classify: (id) =>
      void operations.actions.guard((snapshot) => {
        const document = snapshot.documents.find((doc) => doc.id === id);
        if (!document) return;
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
        if (!entry) return;
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
      <div className="grid min-w-0 gap-1">
        <DocumentTreeLevel
          parent=""
          top
          context={{
            index,
            catalogue: catalogue.data,
            active,
            locked: busy || unknown,
            closed,
            openedEmpty,
            entry: inline.entry,
            renderEntry: (entry) => (
              <InlineEntryEditor
                key={entry.key}
                entry={entry}
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

        {busy && !inline.entry && (
          <p role="status" className="text-body-sm">
            {t('documents.tree.processing')}
          </p>
        )}
        {notice && (
          <p role="status" className="break-words text-body-sm text-content-muted">
            {notice}
          </p>
        )}
        {error && !request && !typeRequest && (
          <Alert tone="attention" title={error}>
            {retry.length > 0 && (
              <Button disabled={busy} onClick={operations.actions.retryImport}>
                {t('documents.tree.retryImport')}
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
          onTargetChange={setTarget}
          onConfirm={() => {
            if (!request) return;
            const after =
              request.action === 'remove-registration' && request.id
                ? rowAfter(request.path, request.id)
                : undefined;
            void operations.actions.confirmDialog(request, target, () => {
              setRequest(undefined);
              if (after) focus.request(after);
            });
          }}
          onClose={() => {
            operations.actions.clearError();
            setRequest(undefined);
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
              operations.actions.createDocument(input, () => setTypeRequest(undefined))
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
