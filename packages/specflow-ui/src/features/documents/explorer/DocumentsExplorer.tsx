import type {
  DocumentOperationResult,
  DocumentTree as Tree,
} from '@nevo/specflow-contracts/documents';
import { useTranslation } from 'react-i18next';
import { useId, useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react';
import { Alert, Button, TooltipProvider } from '@nevo/ui';
import { typeTitle } from '../catalogue/documentTypePolicy';
import { useOperationDialog } from './dialogs/useOperationDialog';
import { DocumentOperationDialogs } from './dialogs/DocumentOperationDialogs';
import { noCatalogue, newTypeRequestKey, type TypeRequest } from './dialogs/type/typeRequest';
import type { CatalogueState } from './dialogs/type/TypeDialogFrame';
import { TypeDialogs } from './dialogs/type/TypeDialogs';
import type { DocumentTreeController } from './documentRootActions';
import { DocumentImporter, type DocumentImporterHandle } from './import/DocumentImporter';
import { useInlineEntry } from './inline-entry/useInlineEntry';
import type { DocumentNodeActions } from './tree/DocumentNodeMenu';
import { createTreeIndex, treeRows } from './tree/documentTreePolicy';
import { ExplorerTree } from './tree/ExplorerTree';
import { filterTreeRows, noTreeFilter, type TreeFilter } from './tree/treeFilter';
import { useTreeFocus } from './tree/useTreeFocus';
import { useDelayedFlag } from './useDelayedFlag';
import { useDialogFocus } from './useDialogFocus';
import {
  useDocumentOperations,
  type DocumentOperation,
  type BeforeActionOptions,
  type NewDocumentEntry,
} from './useDocumentOperations';

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

const toggled = (values: readonly string[], value: string) =>
  values.includes(value) ? values.filter((item) => item !== value) : [...values, value];

const parentOf = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');

// These actions never change an open document's text: its draft stays, nobody is asked.
const keepDrafts = { keepDrafts: true };

/**
 * Folder context owns creation; pending names never masquerade as committed manifest entries.
 * The container wires the pieces: which folders are open, the inline entry, the operations, the
 * importer and the dialogs; the tree itself is `ExplorerTree`.
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
  const [closed, setClosed] = useState<string[]>([]),
    // Empty folders start collapsed; the hint shows only for those the user opened.
    [openedEmpty, setOpenedEmpty] = useState<string[]>([]),
    // New document / Assign type: the dialog that is open (each open is a fresh dialog).
    [typeRequest, setTypeRequest] = useState<TypeRequest>();
  const importer = useRef<DocumentImporterHandle>(null);

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
  // The search and the type filter narrow the rows the tree draws (never the data it acts on).
  const [filter, setFilter] = useState<TreeFilter>(noTreeFilter);
  const allRows = useMemo(() => treeRows(tree), [tree]);
  const filtered = useMemo(() => filterTreeRows(allRows, filter), [allRows, filter]);
  const index = useMemo(() => createTreeIndex(filtered.rows), [filtered.rows]);
  const typeName = (typeId: string) => typeTitle(catalogue.data, typeId);
  /** The type title of a row (its tooltip, menu and accessible name); none for unclassified. */
  const rowTypeTitle = (id?: string) => {
    const row = allRows.documents.find((document) => document.id === id);
    const type = row?.dangling
      ? row.type
      : row?.classification === 'registered'
        ? row.type
        : undefined;

    return type ? typeName(type) : undefined;
  };

  const focus = useTreeFocus(index);
  const dialogFocus = useDialogFocus(focus);
  const { rememberOpener, restoreOpener, forgetOpener, onCloseAutoFocus } = dialogFocus;
  const inline = useInlineEntry({
    operations: operations.actions,
    focus,
    onOpenFolder: (folder) => setClosed((value) => value.filter((path) => path !== folder)),
  });

  const noteId = (kind: string, path: string) =>
    `${noteBase}-note-${kind}-${path.replace(/[^\p{L}\p{N}_-]/gu, '_')}`;
  const select = (id: string) => {
    if (operations.actions.canSelect()) {
      onSelect(id);
    }
  };

  const openTypeDialog = (next: TypeRequest) =>
    void operations.actions.guard(() => {
      rememberOpener();
      operations.actions.clearError();
      setTypeRequest({ ...next, key: newTypeRequestKey() });
    }, keepDrafts);
  /** The row after `id` in its level (focus goes there when the row disappears). */
  const rowAfter = (path: string, id: string) => {
    const level = index.level(parentOf(path));
    const at = level.documents.findIndex((doc) => doc.id === id);
    const next = level.documents[at + 1] ?? level.documents[at - 1];

    return next ? 'doc:' + next.id : 'folder:';
  };

  const dialog = useOperationDialog({ operations: operations.actions, dialogFocus, rowAfter });
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
        ) {
          return;
        }

        rememberOpener();
        operations.actions.clearError();
        setTypeRequest({
          kind: 'classify',
          id,
          path: document.path,
          expectedRevision: document.revision,
          key: newTypeRequestKey(),
        });
      }, keepDrafts),
    removeRegistration: dialog.removeRegistration,
    importInto: (folder) => void operations.actions.guard(() => importer.current?.choose(folder)),
    rename: (kind, path, id) => inline.start(kind, parentOf(path), { id, path }),
    move: dialog.move,
    remove: dialog.remove,
    restoreEntryFocus: inline.focusInput,
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
    <TooltipProvider delayDuration={300}>
      <div className="grid min-w-0 gap-1" aria-busy={busy || undefined}>
        <ExplorerTree
          tree={tree}
          catalogue={catalogue.data}
          rows={allRows}
          filtered={filtered}
          filter={filter}
          index={index}
          active={active}
          busy={busy}
          unknown={unknown}
          working={working}
          closed={closed}
          openedEmpty={openedEmpty}
          inline={inline}
          focus={focus}
          nodeActions={nodeActions}
          typeTitle={typeName}
          rowTypeTitle={rowTypeTitle}
          noteId={noteId}
          onFilterChange={setFilter}
          onToggleFolder={(path, empty) =>
            empty
              ? setOpenedEmpty((value) => toggled(value, path))
              : setClosed((value) => toggled(value, path))
          }
          onOpen={select}
        />
        {error && !dialog.request && !typeRequest && (
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
          request={dialog.request}
          target={dialog.target}
          busy={busy}
          unknown={unknown}
          error={error}
          resumable={resumable}
          dirtyIds={dirtyIds}
          onTargetChange={dialog.setTarget}
          onConfirm={dialog.confirm}
          onClose={dialog.close}
          onCloseAutoFocus={onCloseAutoFocus}
        />
        <TypeDialogs
          request={typeRequest}
          tree={tree}
          catalogue={catalogue}
          specificationTitle={specificationTitle}
          busy={busy}
          unknown={unknown}
          error={error}
          resumable={resumable}
          operations={operations.actions}
          onClose={() => {
            operations.actions.clearError();
            setTypeRequest(undefined);
            restoreOpener();
          }}
          onDone={(focusKey) => {
            forgetOpener();
            setTypeRequest(undefined);
            if (focusKey) {
              focus.request(focusKey);
            }
          }}
        />
      </div>
    </TooltipProvider>
  );
}
