import { useEffect, useRef } from 'react';
import { useSecondaryNavigation, useWorkspaceCapabilities } from '@nevo/ui';

/**
 * The side-panel toggle of the split layout, shared by the Session screen and the New Session
 * screen: one press hides the WHOLE panel (the pinned Context and whatever runtime tab is visible),
 * the next shows it again with what was active.
 *
 * - Hide: `setContextOpen(false)` (the pinned tab unregisters, nothing falls back to another tab)
 *   and, when a runtime tab is visible, `close()` first (its tabs and stacks are retained); the
 *   runtime tab that was active is remembered. A leave guard that keeps the tab keeps the panel.
 * - Show: `setContextOpen(true)`, then `activateTab` for the remembered runtime tab, if it is still
 *   open. When Context itself was active nothing is remembered and Context simply reappears.
 */
export function useSessionSidePanel(contextOpen: boolean, setContextOpen: (open: boolean) => void) {
  const { isOpen: runtimeTabVisible, tabs, close, activateTab } = useSecondaryNavigation();
  const rememberedTabId = useRef<string | null>(null);
  const sidePanelOpen = contextOpen || runtimeTabVisible;

  const toggle = async () => {
    if (sidePanelOpen) {
      const visibleTabId = runtimeTabVisible ? tabs.activeTabId : null;
      if (visibleTabId && !(await close())) {
        return; // a leave guard kept the open tab, so the panel stays
      }

      rememberedTabId.current = visibleTabId;
      setContextOpen(false);

      return;
    }

    setContextOpen(true);
    const remembered = rememberedTabId.current;
    rememberedTabId.current = null;
    if (remembered && tabs.tabs.some((tab) => tab.id === remembered)) {
      await activateTab(remembered);
    }
  };

  return { sidePanelOpen, toggle };
}

/**
 * Below the split width Context is a runtime flow (the "Context" button). When the width reaches
 * the split scheme the pinned Context tab registers, and a leftover runtime Context flow would be a
 * second tab with the same name: close it, so only the pinned tab remains. Only Context's own tab
 * (a closable tab named like it) is touched; Tasks and Work tabs stay.
 */
export function useDropNarrowContextOnSplit(contextTitle: string) {
  const { supportsSplit } = useWorkspaceCapabilities();
  const { tabs, closeTab } = useSecondaryNavigation();
  const leftover = supportsSplit
    ? tabs.tabs.find((tab) => tab.closable && tab.title === contextTitle)?.id
    : undefined;

  useEffect(() => {
    if (leftover) {
      void closeTab(leftover);
    }
  }, [leftover, closeTab]);
}
