import { Upload } from 'lucide-react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { useMessage } from '../../../i18n/message';
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
import type { DemoDocumentTree as Tree } from '@nevo/specflow-contracts/demo';
import { DocumentImporter, type DocumentImporterHandle } from './DocumentImporter';
import { DocumentNodeMenu, type DocumentNodeActions } from './DocumentNodeMenu';
import { DocumentOperationDialogs } from './DocumentOperationDialogs';
import { DocumentTreeLevel } from './DocumentTreeLevel';
import { InlineEntryEditor } from './InlineEntryEditor';
import { createTreeIndex, documentActionReason, type PlannedDocument } from './documentTreePolicy';
import {
  useDocumentOperations,
  type DocumentDialogRequest,
  type DocumentOperation,
} from './useDocumentOperations';
import { useInlineEntry } from './useInlineEntry';
import { useTreeFocus } from './useTreeFocus';

export type { DocumentOperation } from './useDocumentOperations';

interface Props {
  tree: Tree;
  active?: string;
  onSelect: (id: string) => void;
  onAdd: (documents: PlannedDocument[], folders?: string[]) => Promise<void>;
  onOperate: (input: DocumentOperation) => Promise<void>;
  beforeAction?: () => Promise<Tree | false>;
  onBusyChange?: (busy: boolean) => void;
  /** Root-level creation lives in the workspace header menu; it drives the tree through this handle. */
  controllerRef?: Ref<DocumentTreeController>;
}
export interface DocumentTreeController {
  create: (kind: 'document' | 'folder') => void;
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
      label: t('documents.tree.newFile'),
      icon: 'file',
      disabled: !capabilities?.createFile.available || busy,
      onPress: () => controller.current?.create('document'),
      onMenuClosed: () => controller.current?.menuClosed(),
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

const toggled = (values: readonly string[], value: string) =>
  values.includes(value) ? values.filter((item) => item !== value) : [...values, value];

/**
 * Folder context owns creation; pending names never masquerade as committed manifest entries.
 * The container wires the pieces: which folders are open, the inline entry, the operations, the
 * importer and the move/delete dialogs.
 */
export function DocumentsExplorer({
  tree,
  active,
  onSelect,
  onAdd,
  onOperate,
  beforeAction,
  onBusyChange,
  controllerRef,
}: Props) {
  const { t } = useTranslation();
  const text = useMessage();
  const noteBase = useId();
  const [closed, setClosed] = useState<string[]>([]),
    // Empty folders start collapsed; the hint shows only for those the user opened.
    [openedEmpty, setOpenedEmpty] = useState<string[]>([]),
    [request, setRequest] = useState<DocumentDialogRequest>(),
    [target, setTarget] = useState('');
  const importer = useRef<DocumentImporterHandle>(null);

  const operations = useDocumentOperations({ tree, onAdd, onOperate, beforeAction, onBusyChange });
  const { busy, unknown, error, notice, retry } = operations.state;
  const index = useMemo(() => createTreeIndex(tree), [tree]);
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
    importInto: (folder) => void operations.actions.guard(() => importer.current?.choose(folder)),
    rename: (kind, path, id) => inline.start(kind, parentOf(path), { id, path }),
    move: requestDialog('move'),
    remove: requestDialog('delete'),
    restoreEntryFocus: inline.focusInput,
  };

  useImperativeHandle(controllerRef, () => ({
    create: (kind) => inline.beginFromMenu(kind),
    menuClosed: inline.menuClosed,
    upload: () => void operations.actions.guard(() => importer.current?.choose('')),
  }));

  const capabilityReason =
    !tree.capabilities.createFile.available &&
    !tree.capabilities.createFolder.available &&
    !tree.capabilities.import.available
      ? text(
          documentActionReason(
            tree.capabilities.createFile.reason ??
              tree.capabilities.createFolder.reason ??
              tree.capabilities.import.reason,
          ) ?? { key: 'documents.tree.readOnly' },
        )
      : undefined;
  return (
    <TooltipProvider delayDuration={400}>
      <div className="grid min-w-0 gap-1">
        {capabilityReason && (
          <p className="px-2 pb-1 text-body-sm text-content-muted">{capabilityReason}</p>
        )}
        <DocumentTreeLevel
          parent=""
          top
          context={{
            index,
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
        {!tree.documents.length && (
          <p className="text-body-sm text-content-muted">{t('documents.tree.addFirst')}</p>
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
        {error && !request && (
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
          onTargetChange={setTarget}
          onConfirm={() => {
            if (request)
              void operations.actions.confirmDialog(request, target, () => setRequest(undefined));
          }}
          onClose={() => setRequest(undefined)}
        />
      </div>
    </TooltipProvider>
  );
}
