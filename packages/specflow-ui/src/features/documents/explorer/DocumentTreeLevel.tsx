import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  treeBranchClassName,
  treeHintClassName,
  treeNodeClassName,
  treeRootClassName,
  treeRowClassName,
} from '@nevo/ui';
import type { DemoDocumentTree as Tree } from '@nevo/specflow-contracts/demo';
import { DocumentNode, FolderNode } from './DocumentNode';
import type { DocumentTreeIndex } from './documentTreePolicy';
import type { InlineEntry } from './inlineEntry';

/** Everything a level (and the levels below it) needs to draw rows; no state of its own. */
export interface DocumentTreeLevelContext {
  /** The tree grouped by level, built once per tree change. */
  index: DocumentTreeIndex<Tree>;
  /** The open document. */
  active?: string;
  /** An operation is in flight or its outcome is unknown. */
  locked: boolean;
  /** Folders with content that the user collapsed. */
  closed: readonly string[];
  /** Empty folders the user opened. */
  openedEmpty: readonly string[];
  entry?: InlineEntry;
  renderEntry: (entry: InlineEntry) => ReactNode;
  renderMenu: (kind: 'document' | 'folder', path: string, id?: string) => ReactNode;
  register: (key: string) => (node: HTMLButtonElement | null) => void;
  hintId: (path: string) => string;
  onToggleFolder: (path: string, empty: boolean) => void;
  onOpen: (id: string) => void;
}

/** One level of the tree: the entry being created here, its folders, then its documents. */
export function DocumentTreeLevel({
  context,
  parent,
  top,
}: {
  context: DocumentTreeLevelContext;
  parent: string;
  top: boolean;
}): ReactNode {
  const { t } = useTranslation();
  const { index, entry } = context;
  const creatingIn = (path: string) =>
    Boolean(entry && !entry.rename && entry.parent.toLowerCase() === path.toLowerCase());
  const { folders, documents } = index.level(parent);
  const showEntry = creatingIn(parent);
  if (!folders.length && !documents.length && !showEntry) return null;
  return (
    <ul className={top ? treeRootClassName : treeBranchClassName}>
      {showEntry && entry && (
        <li key={entry.key} className={treeNodeClassName}>
          <div className={treeRowClassName}>{context.renderEntry(entry)}</div>
        </li>
      )}
      {folders.map((folder) => {
        const level = index.level(folder.path);
        // An empty folder is an ordinary folder row; it opens (with a quiet hint) only on request.
        const empty = !level.folders.length && !level.documents.length && !creatingIn(folder.path);
        const expanded = empty
          ? context.openedEmpty.includes(folder.path)
          : !context.closed.includes(folder.path);
        const renaming = entry?.kind === 'folder' && entry.rename?.path === folder.path;
        return (
          <FolderNode
            key={folder.path}
            path={folder.path}
            expanded={expanded}
            describedBy={empty && expanded ? context.hintId(folder.path) : undefined}
            buttonRef={context.register('folder:' + folder.path)}
            editor={renaming && entry ? context.renderEntry(entry) : undefined}
            menu={context.renderMenu('folder', folder.path)}
            onToggle={() => context.onToggleFolder(folder.path, empty)}
          >
            {expanded && !empty && (
              <DocumentTreeLevel context={context} parent={folder.path} top={false} />
            )}
            {expanded && empty && (
              <p id={context.hintId(folder.path)} className={treeHintClassName}>
                {t('documents.tree.emptyFolder')}
              </p>
            )}
          </FolderNode>
        );
      })}
      {documents.map((doc) => (
        <DocumentNode
          key={doc.id}
          path={doc.path}
          required={Boolean(doc.required)}
          selected={context.active !== undefined && context.active === doc.id}
          disabled={context.locked}
          buttonRef={context.register('doc:' + doc.id)}
          editor={entry?.rename?.id === doc.id ? context.renderEntry(entry) : undefined}
          menu={context.renderMenu('document', doc.path, doc.id)}
          onOpen={() => context.onOpen(doc.id)}
        />
      ))}
    </ul>
  );
}
