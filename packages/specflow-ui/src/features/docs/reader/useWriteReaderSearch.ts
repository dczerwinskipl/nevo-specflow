import { useCallback } from 'react';
import { useNavigate, useRouter } from '@tanstack/react-router';
import { historyEntryOf, readerAddress, stripHash } from './readerLocation';
import type { DocsReaderSearch } from './readerSearch';

/**
 * Writes the reader's search into its address: a replace of the entry shown, so the search adds
 * no history entry, keeping the document, the section and the entry's state. The entry keeps its
 * identity (`historyEntryOf`): it is the same visit with another search, so the article is not
 * opened again and its reading position stays. While the reader is being left, or on `/docs`
 * before it names a workspace, nothing is written.
 */
export function useWriteReaderSearch(): (search: DocsReaderSearch) => void {
  const navigate = useNavigate();
  const router = useRouter();

  return useCallback(
    (search: DocsReaderSearch) => {
      const from = router.state.location;
      const address = readerAddress(from.pathname);
      if (address?.workspaceId === undefined) {
        return;
      }

      const { workspaceId, documentId } = address;
      const state = {
        docsReader: { ...from.state.docsReader, entry: historyEntryOf(from.state) },
      };
      // The search changes, not the place: no scroll reset, no scroll to the section.
      const keep = { replace: true, resetScroll: false, hashScrollIntoView: false } as const;
      void navigate(
        documentId === undefined
          ? { to: '/workspaces/$workspaceId/docs', params: { workspaceId }, search, state, ...keep }
          : {
              to: '/workspaces/$workspaceId/docs/$documentId',
              params: { workspaceId, documentId },
              hash: stripHash(from.hash),
              search,
              state,
              ...keep,
            },
      );
    },
    [navigate, router],
  );
}
