import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Icon,
  treeBranchClassName,
  treeGlyphSlotClassName,
  treeItemClassName,
  treeItemLabelClassName,
  treeItemLabelTruncateClassName,
  treeLeafItemClassName,
  treeNodeClassName,
  treeRootClassName,
  treeRowClassName,
  treeStateLabelClassName,
} from '@nevo/ui';
import {
  ancestorFolders,
  documentKey,
  folderKey,
  treeKeyTarget,
  visibleRows,
  type DocsFolderNode,
} from './docsTreeModel';

/**
 * The documents of a workspace as a tree (the file tree's row geometry): folders first, the hub
 * first among a folder's documents, titles wrapping. One Tab stop (roving tabindex): the open
 * document when it is visible, else the first row; the arrow keys, Home and End move between the
 * visible rows, Enter and Space open a document or toggle a folder.
 */
export function DocsTree({
  root,
  docsRoot,
  activeDocumentId,
  activePath,
  expanded,
  onToggle,
  onOpen,
}: {
  root: DocsFolderNode;
  /** `docs.root` relative to the checkout, for the full path in a row's tooltip. */
  docsRoot: string;
  activeDocumentId?: string;
  /** The open document's path under `docs.root`, when it is in this tree. */
  activePath?: string;
  expanded: ReadonlySet<string>;
  onToggle: (folderPath: string) => void;
  onOpen: (documentId: string) => void;
}) {
  const { t } = useTranslation();
  const [focusKey, setFocusKey] = useState<string>();
  const rows = visibleRows(root, expanded);
  const activeVisible =
    activePath !== undefined && ancestorFolders(activePath).every((path) => expanded.has(path));
  const fallbackKey =
    activeDocumentId !== undefined && activeVisible ? documentKey(activeDocumentId) : rows[0]?.key;
  // A remembered focus that is no longer visible (its folder collapsed) gives the stop back.
  const stopKey =
    focusKey !== undefined && rows.some((row) => row.key === focusKey) ? focusKey : fallbackKey;

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const current = (event.target as HTMLElement).closest<HTMLElement>('[data-tree-key]');
    const currentKey = current?.dataset.treeKey;
    if (!currentKey) {
      return;
    }

    const target = treeKeyTarget(rows, currentKey, event.key, expanded);
    if (!target) {
      return;
    }

    event.preventDefault();
    if (target.toggle !== undefined) {
      setFocusKey(currentKey);
      onToggle(target.toggle);
    }

    if (target.focus !== undefined) {
      setFocusKey(target.focus);
      event.currentTarget
        .querySelector<HTMLElement>(`[data-tree-key="${CSS.escape(target.focus)}"]`)
        ?.focus();
    }
  };

  const level = (folder: DocsFolderNode, top: boolean): ReactNode => (
    <ul className={top ? treeRootClassName : treeBranchClassName}>
      {folder.folders.map((child) => {
        const open = expanded.has(child.path);
        const key = folderKey(child.path);

        return (
          <li key={key} className={treeNodeClassName}>
            <div className={treeRowClassName}>
              <button
                type="button"
                className={treeItemClassName}
                aria-expanded={open}
                data-tree-key={key}
                tabIndex={stopKey === key ? 0 : -1}
                onFocus={() => setFocusKey(key)}
                onClick={() => onToggle(child.path)}
              >
                <span className={treeGlyphSlotClassName}>
                  <Icon name={open ? 'chevron-down' : 'chevron-right'} />
                </span>
                <Icon name="folder" />
                <span className={treeItemLabelTruncateClassName}>{child.name}</span>
                {child.ownsProposals && (
                  <span className={treeStateLabelClassName}>{t('docs.tree.proposals')}</span>
                )}
              </button>
            </div>
            {open && level(child, false)}
          </li>
        );
      })}
      {folder.documents.map((document) => {
        const key = documentKey(document.documentId);

        return (
          <li key={key} className={treeNodeClassName}>
            <div className={treeRowClassName}>
              <button
                type="button"
                // At a root level without folders there is no glyph column to align with.
                className={
                  top && folder.folders.length === 0 ? treeItemClassName : treeLeafItemClassName
                }
                aria-current={document.documentId === activeDocumentId ? 'page' : undefined}
                data-tree-key={key}
                tabIndex={stopKey === key ? 0 : -1}
                title={`${document.title}\n${docsRoot}/${document.path}`}
                onFocus={() => setFocusKey(key)}
                onClick={() => onOpen(document.documentId)}
              >
                <Icon name="file" className="self-start" />
                {/* Titles are the reader's names and are long: they wrap instead of truncating. */}
                <span className={treeItemLabelClassName}>{document.title}</span>
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );

  return (
    <nav aria-label={t('docs.tree.label')} className="min-w-0" onKeyDown={onKeyDown}>
      {level(root, true)}
    </nav>
  );
}
