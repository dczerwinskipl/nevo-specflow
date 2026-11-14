import { useEffect, useState } from 'react';
import { useRouter } from '@tanstack/react-router';
import { useSecondaryNavigation, useWorkspaceCapabilities } from '@nevo/ui';
import {
  ArticleStackControl,
  docsArticleStack,
  type ArticleStackRoot,
} from '../article/articleStack';
import type { DocsReaderOpener } from './readerLocation';

/** The article the address names, with how its history entry was opened. */
export interface NarrowArticle {
  readonly root: ArticleStackRoot;
  readonly openedFrom?: DocsReaderOpener;
}

/**
 * Keeps the Narrow article stack a projection of the address. The stack exists only while the
 * workspace is stacked and the address names a document. When the address moves:
 *
 * - to the entry below the top (browser Back, or the header Back turned into it), the top is popped;
 * - to an entry a link opened from the top (the link itself, or browser Forward), it is pushed;
 * - anywhere else (a document from the tree or the results, a reload, a resize from a split
 *   layout), a new stack opens with that article alone over the tree.
 *
 * The header Back never moves the stack itself (see `ArticleStackControl`): below the first screen
 * it is browser Back, whose entry is the previous article's; on the first screen `onLeave` leaves
 * the document's address.
 */
export function useNarrowArticleStack({
  article,
  onLeave,
}: {
  /** The article the address names, once the tree is known; `undefined` for none. */
  article: NarrowArticle | undefined;
  onLeave: () => void;
}): ArticleStackControl {
  const router = useRouter();
  const { supportsSplit, measured } = useWorkspaceCapabilities();
  const { isOpen, open, close } = useSecondaryNavigation();
  const [control] = useState(() => new ArticleStackControl());
  const wanted = measured && !supportsSplit ? article : undefined;
  const entry = wanted?.root.entry;

  // The header Back's way out reads the latest address when it is pressed.
  useEffect(() => {
    control.onUserBack = (root) => (root ? onLeave() : router.history.back());
  });

  useEffect(() => {
    if (!measured) {
      return;
    }

    if (!wanted) {
      control.chain = [];
      if (isOpen) {
        control.move(close);
      }

      return;
    }

    const { root, openedFrom } = wanted;
    const chain = control.chain;
    const top = chain.at(-1);
    if (top === root.entry && isOpen) {
      return;
    }

    const shown = isOpen && top !== undefined ? control.screens.get(top) : undefined;
    if (shown && chain.at(-2) === root.entry) {
      control.chain = chain.slice(0, -1);
      control.move(() => shown.back());

      return;
    }

    if (shown && openedFrom?.link && openedFrom.entry === top) {
      control.chain = [...chain, root.entry];
      const { documentId, sectionId, title } = root;
      control.move(() =>
        shown.navTo('linked', { documentId, sectionId, title, entry: root.entry }),
      );

      return;
    }

    control.chain = [root.entry];
    control.move(() => open(docsArticleStack, root));
    // `wanted` is described by its entry (one history entry names one document); the stack is
    // moved only when the address or the stack's visibility changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measured, entry, isOpen]);

  return control;
}
