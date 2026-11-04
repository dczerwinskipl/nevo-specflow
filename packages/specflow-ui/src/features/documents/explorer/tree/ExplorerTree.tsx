import type { ArchetypeCatalogue, DocumentTree as Tree } from '@nevo/specflow-contracts/documents';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  EmptyState,
  InlineNote,
  Spinner,
  Typography,
  treeSectionHeaderClassName,
} from '@nevo/ui';
import { InlineEntryEditor } from '../inline-entry/InlineEntryEditor';
import type { InlineEntrySession } from '../inline-entry/useInlineEntry';
import { DocumentNodeMenu, type DocumentNodeActions } from './DocumentNodeMenu';
import { DocumentTreeLevel } from './DocumentTreeLevel';
import type { DocumentTreeIndex, TreeRows } from './documentTreePolicy';
import { TreeFilterBar } from './TreeFilterBar';
import {
  activeFilterCount,
  noTreeFilter,
  treeTypes,
  type FilteredTreeRows,
  type TreeFilter,
} from './treeFilter';
import type { TreeFocus } from './useTreeFocus';

/**
 * The tree as the explorer shows it: the root header, the search and type filter, the levels with
 * their inline entry and row menus, and the notes about what the tree does not show. It holds no
 * state; the explorer owns it.
 */
export function ExplorerTree({
  tree,
  catalogue,
  rows,
  filtered,
  filter,
  index,
  active,
  busy,
  unknown,
  working,
  closed,
  openedEmpty,
  inline,
  focus,
  nodeActions,
  typeTitle,
  rowTypeTitle,
  noteId,
  onFilterChange,
  onToggleFolder,
  onOpen,
}: {
  tree: Tree;
  catalogue?: ArchetypeCatalogue;
  /** The unfiltered rows. */
  rows: TreeRows;
  /** The rows the filter leaves, with its counts. */
  filtered: FilteredTreeRows;
  filter: TreeFilter;
  /** The filtered rows grouped by level. */
  index: DocumentTreeIndex<TreeRows>;
  active?: string;
  busy: boolean;
  unknown: boolean;
  /** An operation has been running long enough to show the header spinner. */
  working: boolean;
  closed: readonly string[];
  openedEmpty: readonly string[];
  inline: InlineEntrySession;
  focus: TreeFocus;
  nodeActions: DocumentNodeActions;
  typeTitle: (typeId: string) => string;
  /** The type title of a row (its tooltip, menu and accessible name); none for unclassified. */
  rowTypeTitle: (id?: string) => string | undefined;
  noteId: (kind: string, path: string) => string;
  onFilterChange: (filter: TreeFilter) => void;
  onToggleFolder: (path: string, empty: boolean) => void;
  onOpen: (id: string) => void;
}) {
  const { t } = useTranslation();
  const rootHeadingId = useId();
  const filtering = activeFilterCount(filter) > 0;

  return (
    <>
      {/* The root of the tree is a section header (no chevron, never collapses). */}
      <div className={treeSectionHeaderClassName}>
        <Typography
          as="h2"
          id={rootHeadingId}
          variant="section-label"
          className="min-w-0 flex-1 truncate text-content-muted"
        >
          {t('documents.tree.rootTitle')}
        </Typography>
        {working && <Spinner size="sm" data-testid="documents-tree-busy" />}
      </div>
      {(tree.documents.length > 0 || tree.dangling.length > 0) && (
        <TreeFilterBar
          filter={filter}
          types={treeTypes(rows)}
          typeTitle={typeTitle}
          showReset={!(filtering && filtered.matches === 0)}
          status={
            filtering && filtered.matches > 0
              ? t('documents.tree.filter.shown', {
                  count: filtered.matches,
                  total: rows.documents.length,
                })
              : undefined
          }
          onChange={onFilterChange}
        />
      )}
      {filtering && filtered.hiddenMissing > 0 && (
        // A filter never hides a missing file without saying so.
        <InlineNote className="px-2">
          {t('documents.tree.filter.hiddenMissing', { count: filtered.hiddenMissing })}
        </InlineNote>
      )}
      {filtering && filtered.matches === 0 ? (
        <EmptyState
          icon="search"
          title={t('documents.tree.filter.noResults')}
          description={t('documents.tree.filter.noResultsDescription')}
          actions={
            <Button variant="secondary" onClick={() => onFilterChange(noTreeFilter)}>
              {t('documents.tree.filter.clear')}
            </Button>
          }
        />
      ) : null}
      <DocumentTreeLevel
        parent=""
        top
        labelledBy={rootHeadingId}
        context={{
          index,
          catalogue,
          active,
          locked: busy || unknown,
          expandAll: filtering,
          flatRoot: !rows.folders.some((folder) => folder.path !== ''),
          closed,
          openedEmpty,
          entry: inline.entry,
          renderEntry: (entry, flat) => (
            <InlineEntryEditor
              key={entry.key}
              entry={entry}
              flat={flat}
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
              typeTitle={rowTypeTitle(id)}
              locked={busy || unknown}
              noteId={noteId(kind, path)}
              actions={nodeActions}
            />
          ),
          register: focus.register,
          hintId: (path) => noteId('empty', path),
          onToggleFolder,
          onOpen,
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
    </>
  );
}
