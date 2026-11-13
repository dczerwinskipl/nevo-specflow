import { useEffect, useRef } from 'react';
import { useSecondaryNavigation, useWorkspaceCapabilities } from '@nevo/ui';
import { docsArticleStack, type ArticleStackRoot } from '../article/articleStack';

const keyOf = (root: ArticleStackRoot) =>
  `${root.workspaceId}\n${root.documentId}\n${root.sectionId ?? ''}`;

/**
 * Keeps the Narrow article stack in step with the address. The stack exists only while the
 * workspace is stacked: a document in the address opens it (a new stack for every document the
 * address names), no document or a split layout closes it. When the user closes it with the
 * first screen's Back, `onClosedByUser` leaves the document's address.
 *
 * The ledger (which address the stack was opened for, whether it has been shown) is bookkeeping
 * of this one owner, read only in the effect: the stack's own `isOpen` is the visible state.
 */
export function useNarrowArticleStack({
  root,
  onOpen,
  onClosedByUser,
}: {
  /** The article the address names, once the tree is known; `undefined` for none. */
  root: ArticleStackRoot | undefined;
  /** A new stack starts: its reading positions start empty. */
  onOpen: () => void;
  onClosedByUser: () => void;
}) {
  const { supportsSplit, measured } = useWorkspaceCapabilities();
  const navigation = useSecondaryNavigation();
  const ledger = useRef<{ key?: string; shown: boolean }>({ shown: false });
  const stacked = measured && !supportsSplit;
  const wanted = stacked && root ? root : undefined;
  const key = wanted ? keyOf(wanted) : undefined;
  const { isOpen, open, close } = navigation;

  useEffect(() => {
    if (!measured) {
      return;
    }

    const state = ledger.current;
    if (key === undefined || !wanted) {
      state.key = undefined;
      state.shown = false;
      if (isOpen) {
        void close();
      }

      return;
    }

    if (state.key !== key) {
      state.key = key;
      state.shown = false;
      onOpen();
      void open(docsArticleStack, wanted);

      return;
    }

    if (isOpen) {
      state.shown = true;
    } else if (state.shown) {
      // Opened for this address, shown, and now closed: the first screen's Back.
      state.key = undefined;
      state.shown = false;
      onClosedByUser();
    }
    // `wanted` is described by `key`; the callbacks run only on a transition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measured, key, isOpen]);
}
