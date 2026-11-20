import type { ArchetypeCatalogue, DocumentTree as Tree } from '@nevo/specflow-contracts/documents';
import type { DocumentRelation } from '@nevo/specflow-contracts/workflow';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { InlineNote, Spinner, Typography, cn, treeSectionHeaderClassName } from '@nevo/ui';
import {
  TreeSearchEmpty,
  treePaneBlockClassName,
  treePaneTextClassName,
} from '../../../../shared/document-tree';
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
  relations,
  relationsUnavailable = false,
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
  /** How the Specification's workflow uses each document now, by document id. */
  relations?: ReadonlyMap<string, DocumentRelation>;
  /** The workflow projection could not be read: a quiet note says the relations are missing. */
  relationsUnavailable?: boolean;
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
      <div className={cn(treeSectionHeaderClassName, 'mx-2')}>
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
      {/* Attention notes: what the tree hides or could not read, before the list or the empty
          result, so a long list never pushes them out of view. */}
      {filtering && filtered.hiddenMissing > 0 && (
        // A filter never hides a missing file without saying so.
        <InlineNote tone="attention" className={treePaneTextClassName}>
          {t('documents.tree.filter.hiddenMissing', { count: filtered.hiddenMissing })}
        </InlineNote>
      )}
      {tree.skippedEntries > 0 && (
        // A read failure, not a Close refusal: it stays out of the Close Alert.
        <InlineNote tone="attention" className={treePaneTextClassName}>
          {t('documents.tree.skipped', { count: tree.skippedEntries })}
        </InlineNote>
      )}
      {filtering && filtered.matches === 0 ? (
        <TreeSearchEmpty
          title={t('documents.tree.filter.noResults')}
          description={t('documents.tree.filter.noResultsDescription')}
          clearLabel={t('documents.tree.filter.clear')}
          onClear={() => onFilterChange(noTreeFilter)}
        />
      ) : null}
      {/* The level renders nothing without rows (an empty result): then the inset takes no gap. */}
      <div className={cn(treePaneBlockClassName, 'empty:hidden')}>
        <DocumentTreeLevel
          parent=""
          top
          labelledBy={rootHeadingId}
          context={{
            index,
            catalogue,
            relations,
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
      </div>
      {!tree.documents.length && !tree.dangling.length && (
        <p className={cn('text-body-sm text-content-muted', treePaneTextClassName)}>
          {t('documents.tree.addFirst')}
        </p>
      )}
      {/* Quiet notes: a known limit that needs no action, after the list where it is cut. */}
      {tree.truncated && (
        <InlineNote className={treePaneTextClassName}>{t('documents.tree.truncated')}</InlineNote>
      )}
      {relationsUnavailable && (tree.documents.length > 0 || tree.dangling.length > 0) && (
        // Never a silent "no relation": the rows cannot say which documents a step needs.
        <InlineNote className={treePaneTextClassName}>
          {t('documents.tree.relationsUnavailable')}
        </InlineNote>
      )}
    </>
  );
}
