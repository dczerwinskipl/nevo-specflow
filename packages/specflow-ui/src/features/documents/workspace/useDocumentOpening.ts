import { useEffect, useRef, useState, type RefObject } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useSecondaryNavigation, useWorkspaceCapabilities } from '@nevo/ui';
import { useApplicationCollection } from '../../../app/navigation/ApplicationLocation';
import { documentStack } from './DocumentPane';

export interface DocumentOpening {
  /** The document pane is shown (wide layout; the user can close it without leaving the route). */
  open: boolean;
  /** Opens a document from the tree and, in the wide layout, focuses its heading once shown. */
  select: (id: string) => void;
  /** Shows the pane again, or asks to leave unsaved edits before closing it. */
  setOpen: (next: boolean) => void;
}

const headingSelector =
  '[data-workspace-surface="secondary"][data-workspace-active="true"] [data-workspace-header-title="true"]';
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
}): DocumentOpening {
  const { specId, documentId, requestRef } = options;
  const navigate = useNavigate();
  const navigation = useSecondaryNavigation();
  const collection = useApplicationCollection();
  const { supportsSplit } = useWorkspaceCapabilities();
  // The document whose pane the user closed; any other document opens its pane again.
  const [closedFor, setClosedFor] = useState<string>();
  // A document the user opened from the tree and that still has to receive focus once shown.
  const [focusFor, setFocusFor] = useState<string>();
  // Guards the stack effect: the navigation controller changes identity whenever it opens or closes.
  const stackFor = useRef('');
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
    },
    [],
  );

  useEffect(() => {
    if (!documentId) {
      // Back to the list: nothing stays stacked over the tree.
      stackRequest.current += 1;
      if (stackFor.current) {
        stackFor.current = '';
        void navigation.close();
      }
      return;
    }
    const key = `${specId}:${documentId}:${supportsSplit}`;
    if (stackFor.current === key) return;
    stackFor.current = key;
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
      const heading = document.querySelector<HTMLElement>(headingSelector);
      if (heading) {
        heading.focus({ preventScroll: true });
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
    setClosedFor(undefined);
    if (id === documentId) {
      if (!supportsSplit) void navigation.open(documentStack, { specId, documentId: id });
      return;
    }
    if (supportsSplit) setFocusFor(id);
    void navigate({
      to: '/specs/$specId/documents/$documentId',
      params: { specId, documentId: id },
      search: { collection },
    });
  };
  const setOpen = (next: boolean) => {
    if (next) {
      setClosedFor(undefined);
      return;
    }
    void (async () => {
      if (requestRef.current && !(await requestRef.current())) return;
      setClosedFor(documentId);
    })();
  };
  return { open: closedFor === undefined || closedFor !== documentId, select, setOpen };
}
