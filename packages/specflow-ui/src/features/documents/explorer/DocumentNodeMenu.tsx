import { useTranslation } from 'react-i18next';
import {
  IconButton,
  Menu,
  MenuContent,
  MenuItem,
  MenuNote,
  MenuSeparator,
  MenuTrigger,
  treeRowActionClassName,
} from '@nevo/ui';
import type { DemoDocumentTree as Tree } from '@nevo/specflow-contracts/demo';
import { useMessage } from '../../../i18n/message';
import type { EntryKind } from './documentTreePolicy';
import { documentActionReason } from './documentTreePolicy';

/** What the row menu can ask for; the explorer decides how each is carried out. */
export interface DocumentNodeActions {
  open: (id: string) => void;
  create: (kind: EntryKind, parent: string) => void;
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
  actions: DocumentNodeActions;
}) {
  const { t } = useTranslation();
  const text = useMessage();
  const item =
    kind === 'document'
      ? tree.documents.find((doc) => doc.id === id)
      : tree.folders.find((folder) => folder.path === path);
  if (!item) return null;
  const policy = item.actions,
    name = path.split('/').at(-1) ?? path,
    required = kind === 'document' && 'required' in item && item.required === true;
  const reasons: string[] = [];
  const addReason = (reason?: string) => {
    const reasonMessage = documentActionReason(reason);
    const reasonText = reasonMessage ? text(reasonMessage) : undefined;
    if (reasonText && !reasons.includes(reasonText)) reasons.push(reasonText);
  };
  if (required) reasons.push(t('documents.tree.requiredReason'));
  else {
    addReason(policy.rename.reason);
    addReason(policy.move.reason);
    addReason(policy.delete.reason);
  }
  if (kind === 'folder') {
    if (!tree.capabilities.createFile.available) addReason(tree.capabilities.createFile.reason);
    if (!tree.capabilities.createFolder.available) addReason(tree.capabilities.createFolder.reason);
    if (!tree.capabilities.import.available) addReason(tree.capabilities.import.reason);
  }
  const describedBy = reasons.length ? noteId : undefined;
  return (
    <Menu modal={false}>
      <MenuTrigger asChild>
        <IconButton
          className={treeRowActionClassName}
          disabled={locked}
          icon="ellipsis"
          size="sm"
          aria-label={t('documents.tree.rowActions', { name })}
        />
      </MenuTrigger>
      <MenuContent
        align="end"
        aria-describedby={describedBy}
        onCloseAutoFocus={(event) => {
          if (actions.restoreEntryFocus()) event.preventDefault();
        }}
      >
        {kind === 'folder' ? (
          <>
            <MenuItem
              disabled={!tree.capabilities.createFile.available}
              onSelect={() => actions.create('document', path)}
            >
              {t('documents.tree.newFile')}
            </MenuItem>
            <MenuItem
              disabled={!tree.capabilities.createFolder.available}
              onSelect={() => actions.create('folder', path)}
            >
              {t('documents.tree.newFolder')}
            </MenuItem>
            <MenuItem
              disabled={!tree.capabilities.import.available}
              onSelect={() => actions.importInto(path)}
            >
              {t('documents.tree.upload')}
            </MenuItem>
          </>
        ) : (
          <MenuItem onSelect={() => id && actions.open(id)}>{t('common.open')}</MenuItem>
        )}
        <MenuSeparator />
        <MenuItem
          disabled={!policy.rename.available || required}
          onSelect={() => actions.rename(kind, path, id)}
        >
          {t('documents.tree.rename')}
        </MenuItem>
        <MenuItem
          disabled={!policy.move.available || required}
          onSelect={() => actions.move(kind, path, id)}
        >
          {t('documents.tree.move')}
        </MenuItem>
        <MenuItem
          tone="danger"
          disabled={!policy.delete.available || required}
          onSelect={() => actions.remove(kind, path, id)}
        >
          {t('documents.tree.delete')}
        </MenuItem>
        {describedBy && (
          <>
            <MenuSeparator />
            <MenuNote id={describedBy}>{reasons.slice(0, 2).join(' ')}</MenuNote>
          </>
        )}
      </MenuContent>
    </Menu>
  );
}
