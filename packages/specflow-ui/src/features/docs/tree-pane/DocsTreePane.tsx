import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AppContent, ScrollArea, TooltipProvider, Typography, cn } from '@nevo/ui';
import type { WorkspaceDocsTree } from '@nevo/specflow-contracts/docs';
import {
  treePaneBlockClassName,
  treePaneContentClassName,
  treePaneTextClassName,
} from '../../../shared/document-tree';
import type { DocsReaderSearch } from '../reader/readerSearch';
import { DocsSearchPanel } from './DocsSearchPanel';
import { DocsTree } from './DocsTree';
import { SkippedDocuments } from './SkippedDocuments';
import { TreeSkeleton } from './TreeSkeleton';
import { ancestorFolders, buildDocsTree } from './docsTreeModel';
import { usePaneScrollMemory } from './usePaneScrollMemory';

/**
 * The Primary pane of the reader: the way back to a Session, the workspace picker, the quiet
 * lines (fallback, a document missing after a pick, skipped documents), then the search and the
 * tree or the results. A problem of the whole documentation replaces the search and the tree.
 * The tree's expansion lives here and the search is in the address, so both survive opening
 * documents and picking another workspace (where both are looked up again). The pane's scroll is
 * kept per history entry: Back and Forward return the list where it was.
 */
export function DocsTreePane({
  workspaceId,
  historyEntry,
  search,
  onSearchChange,
  sessionBack,
  picker,
  notices,
  tree,
  treeLoading,
  problem,
  activeDocumentId,
  onOpen,
}: {
  workspaceId: string | undefined;
  /** The history entry of the address: it keys the pane's scroll. */
  historyEntry: string;
  /** The search the address holds. */
  search: DocsReaderSearch;
  /** Writes the search into the address (a replace). */
  onSearchChange: (search: DocsReaderSearch) => void;
  sessionBack?: ReactNode;
  picker?: ReactNode;
  /** Quiet status lines under the picker (fallback, a document missing after a pick). */
  notices: readonly string[];
  tree?: WorkspaceDocsTree;
  treeLoading: boolean;
  /**
   * Replaces the search and the tree: the message of the whole documentation on Narrow, `null` on
   * split layouts (the article area says it).
   */
  problem?: ReactNode;
  activeDocumentId?: string;
  onOpen: (documentId: string, sectionId?: string) => void;
}) {
  const { t } = useTranslation();
  // The scroll viewport: its scroll is kept per entry, and the search field docks in it.
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null);
  usePaneScrollMemory(historyEntry, viewport);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const root = useMemo(() => (tree ? buildDocsTree(tree.documents) : undefined), [tree]);
  const proposals = useMemo(
    () =>
      new Set((tree?.documents ?? []).filter((doc) => doc.proposal).map((doc) => doc.documentId)),
    [tree],
  );
  const activePath = tree?.documents.find((doc) => doc.documentId === activeDocumentId)?.path;

  // The open document's folders open when it is entered (a link, a result, an address).
  const [openedFor, setOpenedFor] = useState<string>();
  if (activePath !== undefined && activePath !== openedFor) {
    setOpenedFor(activePath);
    setExpanded((current) => new Set([...current, ...ancestorFolders(activePath)]));
  }

  const treeView =
    root && tree ? (
      <DocsTree
        root={root}
        docsRoot={tree.docsRoot}
        activeDocumentId={activeDocumentId}
        expanded={expanded}
        onToggle={(path) =>
          setExpanded((current) => {
            const next = new Set(current);
            if (!next.delete(path)) {
              next.add(path);
            }

            return next;
          })
        }
        onOpen={(documentId) => onOpen(documentId)}
      />
    ) : treeLoading ? (
      <TreeSkeleton label={t('docs.tree.loading')} />
    ) : null;

  return (
    // The pane's tooltips (the tree rows' paths) share one provider, as in the Documents explorer.
    <TooltipProvider delayDuration={300}>
      <AppContent className="h-full w-full">
        {/* The pane's rows are focusable themselves: the scroller adds no Tab stop of its own. */}
        <ScrollArea
          direction="vertical"
          className="min-h-0 flex-1"
          contentClassName={treePaneContentClassName}
          viewportRef={setViewport}
          tabIndex={-1}
        >
          {sessionBack && <div className={treePaneBlockClassName}>{sessionBack}</div>}
          {picker && <div className={treePaneBlockClassName}>{picker}</div>}
          {notices.map((notice) => (
            <Typography
              key={notice}
              as="p"
              variant="body-sm"
              role="status"
              className={cn('text-content-secondary wrap-anywhere', treePaneTextClassName)}
            >
              {notice}
            </Typography>
          ))}
          {problem !== undefined
            ? problem && <div className={treePaneBlockClassName}>{problem}</div>
            : tree &&
              tree.skipped.length > 0 && (
                <div className={treePaneBlockClassName}>
                  <SkippedDocuments skipped={tree.skipped} docsRoot={tree.docsRoot} />
                </div>
              )}
          <DocsSearchPanel
            hidden={problem !== undefined}
            workspaceId={workspaceId}
            historyEntry={historyEntry}
            scrollRoot={viewport}
            search={search}
            onSearchChange={onSearchChange}
            proposals={proposals}
            activeDocumentId={activeDocumentId}
            onOpen={onOpen}
          >
            {treeView}
          </DocsSearchPanel>
        </ScrollArea>
      </AppContent>
    </TooltipProvider>
  );
}
