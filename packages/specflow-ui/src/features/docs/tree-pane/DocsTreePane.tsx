import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AppContent, ScrollArea, Typography } from '@nevo/ui';
import type { WorkspaceDocsTree } from '@nevo/specflow-contracts/docs';
import { DocsSearchPanel } from './DocsSearchPanel';
import { DocsTree } from './DocsTree';
import { SkippedDocuments } from './SkippedDocuments';
import { TreeSkeleton } from './TreeSkeleton';
import { ancestorFolders, buildDocsTree } from './docsTreeModel';

/**
 * The Primary pane of the reader: the way back to a Session, the workspace picker, the quiet
 * lines (fallback, a document missing after a pick, skipped documents), then the search and the
 * tree or the results. A problem of the whole documentation replaces the search and the tree.
 * The search text and the tree's expansion live here, so they survive opening documents and
 * picking another workspace (where both are looked up again).
 */
export function DocsTreePane({
  workspaceId,
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
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const root = useMemo(() => (tree ? buildDocsTree(tree.documents) : undefined), [tree]);
  const nonAuthoritative = useMemo(
    () =>
      new Set(
        (tree?.documents ?? []).filter((doc) => doc.nonAuthoritative).map((doc) => doc.documentId),
      ),
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
        activePath={activePath}
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
    <AppContent className="h-full w-full">
      {/* The pane's rows are focusable themselves: the scroller adds no Tab stop of its own. */}
      <ScrollArea
        direction="vertical"
        className="min-h-0 flex-1"
        contentClassName="grid content-start gap-3 p-2"
        tabIndex={-1}
      >
        {sessionBack && <div className="px-2">{sessionBack}</div>}
        {picker}
        {notices.map((notice) => (
          <Typography
            key={notice}
            as="p"
            variant="body-sm"
            role="status"
            className="px-2 text-content-secondary wrap-anywhere"
          >
            {notice}
          </Typography>
        ))}
        {problem !== undefined
          ? problem && <div className="px-2">{problem}</div>
          : tree && <SkippedDocuments skipped={tree.skipped} docsRoot={tree.docsRoot} />}
        <DocsSearchPanel
          hidden={problem !== undefined}
          workspaceId={workspaceId}
          nonAuthoritative={nonAuthoritative}
          activeDocumentId={activeDocumentId}
          onOpen={onOpen}
        >
          {treeView}
        </DocsSearchPanel>
      </ScrollArea>
    </AppContent>
  );
}
