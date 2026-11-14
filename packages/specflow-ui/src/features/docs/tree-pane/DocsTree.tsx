import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  TreeDocumentRow,
  TreeFolderRow,
  TreeLevel,
  useRovingTree,
} from '../../../shared/document-tree';
import { documentKey, folderKey, visibleRows, type DocsFolderNode } from './docsTreeModel';

/**
 * The documents of a workspace on the shared document tree, read-only: folders first, the hub
 * first among a folder's documents, titles wrapping (they are the reader's names and are long),
 * the full path in a row's tooltip, "Proposals" on the folder that owns them. One Tab stop: the
 * open document when it is visible, else the first row.
 */
export function DocsTree({
  root,
  docsRoot,
  activeDocumentId,
  expanded,
  onToggle,
  onOpen,
}: {
  root: DocsFolderNode;
  /** `docs.root` relative to the checkout, for the full path in a row's tooltip. */
  docsRoot: string;
  activeDocumentId?: string;
  expanded: ReadonlySet<string>;
  onToggle: (folderPath: string) => void;
  onOpen: (documentId: string) => void;
}) {
  const { t } = useTranslation();
  const { onKeyDown, rowFocus } = useRovingTree({
    rows: visibleRows(root, expanded),
    expanded,
    preferredKey: activeDocumentId === undefined ? undefined : documentKey(activeDocumentId),
    onToggle,
  });

  const level = (folder: DocsFolderNode, top: boolean): ReactNode => (
    <TreeLevel top={top} flat={top && folder.folders.length === 0}>
      {folder.folders.map((child) => {
        const open = expanded.has(child.path);

        return (
          <TreeFolderRow
            key={child.path}
            name={child.name}
            expanded={open}
            state={child.ownsProposals ? { text: t('docs.tree.proposals') } : undefined}
            focus={rowFocus(folderKey(child.path))}
            onToggle={() => onToggle(child.path)}
          >
            {open && level(child, false)}
          </TreeFolderRow>
        );
      })}
      {folder.documents.map((document) => (
        <TreeDocumentRow
          key={document.documentId}
          name={document.title}
          wrap
          details={[`${docsRoot}/${document.path}`]}
          current={document.documentId === activeDocumentId}
          focus={rowFocus(documentKey(document.documentId))}
          onOpen={() => onOpen(document.documentId)}
        />
      ))}
    </TreeLevel>
  );

  return (
    <nav aria-label={t('docs.tree.label')} className="min-w-0" onKeyDown={onKeyDown}>
      {level(root, true)}
    </nav>
  );
}
