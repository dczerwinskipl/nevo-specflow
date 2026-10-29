import type { ActionReason, DocumentTree as Tree } from '@nevo/specflow-contracts/documents';
import { useTranslation } from 'react-i18next';
import {
  IconButton,
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuNote,
  MenuSeparator,
  MenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  treeRowActionClassName,
} from '@nevo/ui';
import { useMessage } from '../../../i18n/message';
import { menuReasonNote } from '../catalogue/documentTypePolicy';
import { folderActions, type EntryKind } from './documentTreePolicy';

/** What the row menu can ask for; the explorer decides how each is carried out. */
export interface DocumentNodeActions {
  create: (kind: EntryKind, parent: string) => void;
  /** Opens New document (type chooser) for the folder. */
  newDocument: (folder: string) => void;
  /** Opens Assign type for an unclassified document. */
  classify: (id: string) => void;
  /** Asks to remove the registration of a dangling entry (its file is missing). */
  removeRegistration: (id: string) => void;
  importInto: (folder: string) => void;
  rename: (kind: EntryKind, path: string, id?: string) => void;
  move: (kind: EntryKind, path: string, id?: string) => void;
  remove: (kind: EntryKind, path: string, id?: string) => void;
  /** An inline entry is open: the menu hands focus back to it instead of its trigger. */
  restoreEntryFocus: () => boolean;
}

/** The "..." menu of a folder or document row, with the reasons an action is unavailable. */
export function DocumentNodeMenu({
  tree,
  kind,
  path,
  id,
  locked,
  noteId,
  typeTitle,
  actions,
}: {
  tree: Tree;
  kind: EntryKind;
  path: string;
  id?: string;
  /** An operation is in flight or its outcome is unknown. */
  locked: boolean;
  /** DOM id of this menu's note (reasons) so the menu can describe itself. */
  noteId: string;
  /** The document's type title: the row's tooltip says it, the menu says it on touch too. */
  typeTitle?: string;
  actions: DocumentNodeActions;
}) {
  const { t } = useTranslation();
  const text = useMessage();
  const document = kind === 'document' ? tree.documents.find((doc) => doc.id === id) : undefined;
  const dangling =
    kind === 'document' && !document ? tree.dangling.find((entry) => entry.id === id) : undefined;
  const folder = kind === 'folder' ? tree.folders.find((entry) => entry.path === path) : undefined;
  if (!document && !dangling && !folder) return null;
  const name = path.split('/').at(-1) ?? path;
  const reasons: string[] = [];
  const addReason = (reason?: ActionReason) => {
    const note = menuReasonNote(reason);
    const noteText = note ? text(note) : undefined;
    if (noteText && !reasons.includes(noteText)) reasons.push(noteText);
  };
  // The protected overview offers no action at all: its menu is the note that says why.
  const protectedDocument = document?.protected === true;
  const unclassified = document?.classification === 'unclassified';
  const classify = document
    ? document.actions.classify.available && tree.capabilities.classify.available
      ? { available: true as const }
      : {
          available: false as const,
          reason: document.actions.classify.reason ?? tree.capabilities.classify.reason,
        }
    : undefined;
  const policy = document?.actions ?? (folder ? folderActions(folder) : undefined);
  if (protectedDocument) addReason('protected');
  else if (dangling) {
    if (!dangling.actions.delete.available) addReason(dangling.actions.delete.reason);
  } else if (policy) {
    if (unclassified && classify && !classify.available) addReason(classify.reason);
    if (!policy.rename.available) addReason(policy.rename.reason);
    if (!policy.move.available) addReason(policy.move.reason);
    if (!policy.delete.available) addReason(policy.delete.reason);
  }
  if (folder) {
    if (!tree.capabilities.createFile.available) addReason(tree.capabilities.createFile.reason);
    if (!tree.capabilities.createFolder.available) addReason(tree.capabilities.createFolder.reason);
    if (!tree.capabilities.import.available) addReason(tree.capabilities.import.reason);
  }
  const describedBy = reasons.length ? noteId : undefined;
  const typeLine = typeTitle ? t('documents.tree.typeOf', { type: typeTitle }) : undefined;
  const note = describedBy && <MenuNote id={describedBy}>{reasons.slice(0, 2).join(' ')}</MenuNote>;
  const trigger = (
    <IconButton
      className={treeRowActionClassName}
      disabled={locked}
      icon="ellipsis"
      size="sm"
      aria-label={t('documents.tree.rowActions', { name })}
    />
  );
  // The protected overview has no action at all: its "..." explains why instead of a menu of
  // dead disabled items (a menu without items would not be a valid menu either).
  if (protectedDocument)
    return (
      <Popover>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent
          align="end"
          aria-label={t('documents.tree.rowActions', { name })}
          // Narrower than the tree pane, so it stays inside it; padded like a menu note.
          className="w-60 px-3 py-2 text-body-sm text-content-muted"
        >
          {typeLine && <p className="mb-1 text-content-secondary">{typeLine}</p>}
          {reasons[0]}
        </PopoverContent>
      </Popover>
    );
  return (
    <Menu modal={false}>
      <MenuTrigger asChild>{trigger}</MenuTrigger>
      <MenuContent
        align="end"
        aria-describedby={describedBy}
        onCloseAutoFocus={(event) => {
          if (actions.restoreEntryFocus()) event.preventDefault();
        }}
      >
        {typeLine && <MenuLabel>{typeLine}</MenuLabel>}
        {folder && (
          <>
            <MenuItem
              disabled={!tree.capabilities.createFile.available}
              leadingIcon="file"
              onSelect={() => actions.newDocument(path)}
            >
              {t('documents.tree.newDocument')}
            </MenuItem>
            <MenuItem
              disabled={!tree.capabilities.createFolder.available}
              leadingIcon="folder"
              onSelect={() => actions.create('folder', path)}
            >
              {t('documents.tree.newFolder')}
            </MenuItem>
            <MenuItem
              disabled={!tree.capabilities.import.available}
              leadingIcon="upload"
              onSelect={() => actions.importInto(path)}
            >
              {t('documents.tree.upload')}
            </MenuItem>
            <MenuSeparator />
          </>
        )}
        {dangling && (
          <MenuItem
            tone="danger"
            disabled={!dangling.actions.delete.available}
            leadingIcon="unlink"
            onSelect={() => actions.removeRegistration(dangling.id)}
          >
            {t('documents.tree.removeRegistration')}
          </MenuItem>
        )}
        {unclassified && document && (
          <>
            <MenuItem
              disabled={!classify?.available}
              leadingIcon="classify"
              onSelect={() => actions.classify(document.id)}
            >
              {t('documents.tree.assignType')}
            </MenuItem>
            <MenuSeparator />
          </>
        )}
        {/* A file's row itself opens it, so the menu holds no copy of that action. */}
        {policy && (
          <>
            <MenuItem
              disabled={!policy.rename.available}
              leadingIcon="rename"
              onSelect={() => actions.rename(kind, path, id)}
            >
              {t('documents.tree.rename')}
            </MenuItem>
            <MenuItem
              disabled={!policy.move.available}
              leadingIcon="move"
              onSelect={() => actions.move(kind, path, id)}
            >
              {t('documents.tree.move')}
            </MenuItem>
            <MenuItem
              tone="danger"
              disabled={!policy.delete.available}
              leadingIcon="trash"
              onSelect={() => actions.remove(kind, path, id)}
            >
              {t('documents.tree.delete')}
            </MenuItem>
          </>
        )}
        {note && (
          <>
            <MenuSeparator />
            {note}
          </>
        )}
      </MenuContent>
    </Menu>
  );
}
