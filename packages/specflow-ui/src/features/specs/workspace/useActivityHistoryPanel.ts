import { useState } from 'react';
import { useSecondaryNavigation } from '@nevo/ui';

/**
 * Activity history as the declarative Secondary of Specification Overview on split layouts.
 *
 * It is open by default only when the history has entries: an empty history does not reserve the
 * Secondary, so Overview uses the space. The default is taken once, when the Overview of a
 * Specification mounts. From then on the panel belongs to the user: a refresh or a first event
 * never opens or closes it, so a panel the user opened stays open while it is empty.
 *
 * `toggle` is the one owner of the Primary header's history control. A contextual flow (a Task or
 * document preview) covers the history while it is shown, so the control then brings the history
 * forward instead of closing it.
 */
export function useActivityHistoryPanel(hasEntries: boolean) {
  const { isOpen: flowVisible, close } = useSecondaryNavigation();
  const [open, setOpen] = useState(hasEntries);
  const visible = open && !flowVisible;

  const toggle = async () => {
    if (visible) {
      setOpen(false);

      return;
    }

    if (flowVisible && !(await close())) {
      return; // the flow's leave guard kept it
    }

    setOpen(true);
  };

  return { open, setOpen, visible, toggle };
}
