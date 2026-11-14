import { useEffect } from 'react';
import { useLocation, useNavigate } from '@tanstack/react-router';
import { AppWorkspaceProvider } from '@nevo/ui';
import { useCurrentDocsWorkspace } from '../current-workspace/useCurrentDocsWorkspace';
import { useDocsTree } from '../read-model';
import { DocsReader } from './DocsReader';
import {
  historyEntryOf,
  readerAddress,
  stripHash,
  sessionOf,
  withoutSource,
  type DocsReaderLocationState,
} from './readerLocation';

/**
 * Layout of the reader's routes. It resolves the workspace the reader shows (the address, else the
 * tab's current workspace, settled against the registered workspaces), keeps the address naming
 * it (`/docs` and a fallback are replaced), and consumes the one-time intent of the navigation
 * that led here, so a reload or Back to the entry does not replay an explicit pick.
 */
export function DocsReaderLayout() {
  const navigate = useNavigate();
  // The address and its state from one location: during a navigation the router's location moves
  // before its matched params do, and a mix of both would read the new intent with the old address.
  // While the reader is being left the location already names the next screen: the layout then
  // decides nothing (no redirect, no consumed entry), or it would pull the user back in.
  const location = useLocation();
  const address = readerAddress(location.pathname);
  const onReader = address !== undefined;
  const { workspaceId: routeWorkspaceId, documentId } = address ?? {};
  const entry: DocsReaderLocationState | undefined = onReader
    ? location.state.docsReader
    : undefined;
  const current = useCurrentDocsWorkspace({ routeWorkspaceId, routeSource: entry?.source });
  // While leaving, the shown workspace stays (no loading frame before the next screen).
  const settled = !onReader || current.redirectTo === undefined ? current.workspaceId : undefined;
  const tree = useDocsTree(settled);
  const hash = stripHash(location.hash);

  // The address names the workspace shown: `/docs` and a fallback are replaced, the document,
  // the section and the entry kept.
  const { redirectTo } = current;
  // A fallback says why in the pane; the intent of the entry is spent, so a replayed source must
  // not turn the fallback back into the workspace that was asked for.
  const redirectEntry = current.notice ? withoutSource(entry) : entry;
  useEffect(() => {
    if (redirectTo === undefined || !onReader) {
      return;
    }

    void navigate(
      documentId === undefined
        ? {
            to: '/workspaces/$workspaceId/docs',
            params: { workspaceId: redirectTo },
            state: { docsReader: redirectEntry },
            replace: true,
          }
        : {
            to: '/workspaces/$workspaceId/docs/$documentId',
            params: { workspaceId: redirectTo, documentId },
            hash,
            state: { docsReader: redirectEntry },
            replace: true,
          },
    );
    // The redirect follows the decision only; the address parts are read when it is made.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [redirectTo, onReader]);

  // A pick or a Session entry is an intent of one navigation: once the store holds it, the entry
  // is replaced without it. After a pick, a document the new workspace does not have is said once
  // in the pane and the address shows the workspace's documentation instead.
  const pickedMissing =
    entry?.source === 'pick' &&
    documentId !== undefined &&
    tree.data !== undefined &&
    !tree.data.documents.some((doc) => doc.documentId === documentId);
  const consumable =
    onReader &&
    entry?.source !== undefined &&
    settled !== undefined &&
    settled === routeWorkspaceId &&
    (entry.source !== 'pick' || current.source === 'pick') &&
    (entry.source !== 'pick' || documentId === undefined || !tree.isPending);
  useEffect(() => {
    if (!consumable || !settled) {
      return;
    }

    const next: DocsReaderLocationState = {
      ...sessionOf(entry),
      ...(pickedMissing && entry?.notInWorkspace ? { notInWorkspace: entry.notInWorkspace } : {}),
    };
    void navigate(
      documentId === undefined || pickedMissing
        ? {
            to: '/workspaces/$workspaceId/docs',
            params: { workspaceId: settled },
            state: { docsReader: next },
            replace: true,
          }
        : {
            to: '/workspaces/$workspaceId/docs/$documentId',
            params: { workspaceId: settled, documentId },
            hash,
            state: { docsReader: next },
            replace: true,
          },
    );
    // Runs once per consumable entry; the rest is read when it runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consumable]);

  return (
    // A workspace switch starts a new Secondary scope: the Narrow stack of the previous workspace
    // closes (the same document reopens in the new one when the address still names it).
    <AppWorkspaceProvider scopeKey={`docs:${settled ?? ''}`}>
      <DocsReader
        current={current}
        workspaceId={settled}
        documentId={settled !== undefined && !pickedMissing ? documentId : undefined}
        hash={hash}
        entry={entry}
        historyEntry={historyEntryOf(location.state)}
        tree={tree}
      />
    </AppWorkspaceProvider>
  );
}
