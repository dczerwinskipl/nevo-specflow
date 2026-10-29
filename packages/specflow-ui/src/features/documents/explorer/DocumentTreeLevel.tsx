import type { ArchetypeCatalogue } from '@nevo/specflow-contracts/documents';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  treeBranchClassName,
  treeHintClassName,
  treeNodeClassName,
  treeRootClassName,
  treeRowClassName,
} from '@nevo/ui';
import { DocumentNode, FolderNode } from './DocumentNode';
import { documentRowGlyph, documentTrailingLabel } from '../catalogue/documentTypePolicy';
import type { DocumentTreeIndex, TreeRows } from './documentTreePolicy';
import type { InlineEntry } from './inlineEntry';

/** Everything a level (and the levels below it) needs to draw rows; no state of its own. */
export interface DocumentTreeLevelContext {
  /** The tree grouped by level, built once per tree change. */
  index: DocumentTreeIndex<TreeRows>;
  /** Type titles for the trailing labels (ids while it is unavailable). */
  catalogue?: ArchetypeCatalogue;
  /** The open document. */
  active?: string;
  /** An operation is in flight or its outcome is unknown. */
  locked: boolean;
  /** Folders with content that the user collapsed. */
  closed: readonly string[];
  /** A filter is active: every folder that holds a match is shown open. */
  expandAll?: boolean;
  /**
   * The whole tree's main folder has no folders. Decided on the unfiltered tree, so a filter that
   * leaves no folder does not move the files sideways.
   */
  flatRoot?: boolean;
  /** Empty folders the user opened. */
  openedEmpty: readonly string[];
  entry?: InlineEntry;
  /** `flat`: the entry is in a level without folders (no offset to a folder icon column). */
  renderEntry: (entry: InlineEntry, flat?: boolean) => ReactNode;
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
  labelledBy,
}: {
  context: DocumentTreeLevelContext;
  parent: string;
  top: boolean;
  /** The top level's list is named by the tree's root header. */
  labelledBy?: string;
}): ReactNode {
  const { t } = useTranslation();
  const { index, entry } = context;
  const creatingIn = (path: string) =>
    Boolean(entry && !entry.rename && entry.parent.toLowerCase() === path.toLowerCase());
  const { folders, documents } = index.level(parent);
  const showEntry = creatingIn(parent);
  if (!folders.length && !documents.length && !showEntry) return null;
  // A top level without folders is a flat list: its files have no folder icon column to line up
  // with, so they start at the row edge instead of looking nested.
  const flat =
    top && (context.flatRoot ?? !folders.length) && !(showEntry && entry?.kind === 'folder');
  // The specification's main file (the protected overview) leads its level, before the folders.
  const main = documents.filter((doc) => !doc.dangling && doc.protected);
  const rest = main.length ? documents.filter((doc) => !main.includes(doc)) : documents;
  const documentRow = (doc: (typeof documents)[number]) => (
    <DocumentNode
      key={doc.id}
      path={doc.path}
      flat={flat}
      glyph={doc.dangling ? undefined : documentRowGlyph(doc)}
      main={!doc.dangling && doc.protected}
      label={doc.dangling ? { kind: 'missing' } : documentTrailingLabel(doc, context.catalogue)}
      selected={context.active !== undefined && context.active === doc.id}
      disabled={context.locked}
      buttonRef={context.register('doc:' + doc.id)}
      editor={entry?.rename?.id === doc.id ? context.renderEntry(entry, flat) : undefined}
      menu={context.renderMenu('document', doc.path, doc.id)}
      onOpen={() => context.onOpen(doc.id)}
    />
  );
  return (
    <ul className={top ? treeRootClassName : treeBranchClassName} aria-labelledby={labelledBy}>
      {main.map(documentRow)}
      {showEntry && entry && (
        <li key={entry.key} className={treeNodeClassName}>
          <div className={treeRowClassName}>{context.renderEntry(entry, flat)}</div>
        </li>
      )}
      {folders.map((folder) => {
        const level = index.level(folder.path);
        // An empty folder is an ordinary folder row; it opens (with a quiet hint) only on request.
        const empty = !level.folders.length && !level.documents.length && !creatingIn(folder.path);
        const expanded = empty
          ? context.openedEmpty.includes(folder.path)
          : context.expandAll === true || !context.closed.includes(folder.path);
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
      {rest.map(documentRow)}
    </ul>
  );
}
