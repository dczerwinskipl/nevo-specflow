import { useEffect, useRef, useState, type RefObject } from 'react';
import { useSecondaryNavigation, useWorkspaceCapabilities } from '@nevo/ui';
import { regionHeading } from '../outline/regionHeading';
import { useDocumentTabs } from '../tabs/DocumentTabsProvider';
import { documentStack } from './DocumentPane';

export interface DocumentOpening {
  /**
   * Opens a document from the tree as a new tab, or activates its tab; in the wide layout the
   * active tab receives focus once shown.
   */
  select: (id: string) => void;
  /** Closes every tab after asking ONCE about the unsaved documents (the region's close). */
  closeAll: () => void;
}

const focusAttempts = 20;

/**
 * Which document is shown and how the user gets to it: selection navigates, the narrow layout also
 * opens it as a Secondary stack, and a document opened from the tree receives focus on its heading
 * (the tree row is replaced by the route change, so focus would otherwise drop to the page).
 * All of it is state of this instance: the Documents layout persists across document switches.
 */
export function useDocumentOpening(options: {
  specId: string;
  documentId?: string;
  /** Asks to leave unsaved edits; resolves false when the user keeps editing. */
  requestRef: RefObject<(() => Promise<boolean>) | null>;
  /** Carries out the discard the answer allowed, once the tabs have really closed. */
  commitRef?: RefObject<(() => void) | null>;
}): DocumentOpening {
  const { specId, documentId, requestRef, commitRef } = options;
  const tabs = useDocumentTabs();
  const navigation = useSecondaryNavigation();
  const { supportsSplit } = useWorkspaceCapabilities();
  // A document the user opened from the tree and that still has to receive focus once shown.
  const [focusFor, setFocusFor] = useState<string>();
  // Guards the stack effect: the navigation controller changes identity whenever it opens or closes.
  const stackFor = useRef('');
  // The specification and layout the stacked screen was last requested for.
  const stackLayout = useRef('');
  // Identifies the latest stack request. `close()` is asynchronous, so a continuation that is no
  // longer the latest (superseded target, left the route, unmounted) must not open its document.
  // It is a ref, not an effect-local flag: the effect re-runs on every controller identity change
  // and that must not cancel a request that is still the current one.
  const stackRequest = useRef(0);

  useEffect(
    () => () => {
      // Unmount (or a StrictMode remount): drop the pending request and let the next setup restart.
      stackRequest.current += 1;
      stackFor.current = '';
      stackLayout.current = '';
    },
    [],
  );

  useEffect(() => {
    if (!documentId) {
      // Back to the list: nothing stays stacked over the tree.
      stackRequest.current += 1;
      if (stackFor.current) {
        stackFor.current = '';
        stackLayout.current = '';
        void navigation.close();
      }
      return;
    }
    const key = `${specId}:${documentId}:${supportsSplit}`;
    if (stackFor.current === key) return;
    const layout = `${specId}:${supportsSplit}`;
    const sameLayout = stackLayout.current === layout;
    stackFor.current = key;
    stackLayout.current = layout;
    // The stacked screen follows the active tab by itself: a tab switch changes nothing there, and
    // closing then reopening it would remount the editor. Only a new layout or specification does.
    if (sameLayout && navigation.isOpen) return;
    stackRequest.current += 1;
    const request = stackRequest.current;
    void (async () => {
      await navigation.close();
      if (request !== stackRequest.current) return;
      if (!supportsSplit) await navigation.open(documentStack, { specId, documentId });
    })();
  }, [documentId, specId, supportsSplit, navigation]);

  useEffect(() => {
    if (!supportsSplit || !documentId || focusFor !== documentId) return;
    let attempts = 0;
    let frame = 0;
    const tryFocus = () => {
      // The region heading, not the tab: focus moved onto a tab opens its tooltip over the header, and
      // the heading announces the document that just opened.
      const target = regionHeading();
      if (target) {
        target.focus({ preventScroll: true });
        setFocusFor(undefined);
        return;
      }
      attempts += 1;
      if (attempts < focusAttempts) frame = requestAnimationFrame(tryFocus);
    };
    frame = requestAnimationFrame(tryFocus);
    return () => cancelAnimationFrame(frame);
  }, [documentId, supportsSplit, focusFor]);

  const select = (id: string) => {
    if (id === documentId) {
      // Choosing the shown document again (for example the main file opened by itself) still
      // takes the reader to it.
      if (!supportsSplit) void navigation.open(documentStack, { specId, documentId: id });
      else setFocusFor(id);
      return;
    }
    if (supportsSplit) setFocusFor(id);
    void tabs.show(id);
  };
  const closeAll = () => {
    void (async () => {
      if (requestRef.current && !(await requestRef.current())) return;
      if (await tabs.closeAll()) commitRef?.current?.();
    })();
  };
  return { select, closeAll };
}
