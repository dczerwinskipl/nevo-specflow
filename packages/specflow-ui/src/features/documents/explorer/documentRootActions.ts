import type { DocumentTree as Tree } from '@nevo/specflow-contracts/documents';
import type { TFunction } from 'i18next';
import type { RefObject } from 'react';
import type { WorkspaceHeaderAction } from '@nevo/ui';

/** What the workspace header menu (and the tabs) can ask the explorer to do. */
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
