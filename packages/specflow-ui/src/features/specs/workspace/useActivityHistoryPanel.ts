import { useState } from 'react';
import { useSecondaryNavigation } from '@nevo/ui';
import { useHistoryPanelChoice } from '../SpecificationStateProvider';

/**
 * Activity history as the declarative Secondary of Specification Overview on split layouts.
 *
 * Once the user shows or hides it, that explicit choice wins for this Specification for the rest
 * of the visit (in memory only): leaving the Overview and coming back keeps it, and no data update
 * opens or closes it, so a history the user opened stays open while it is empty.
 *
 * Without an explicit choice the panel is open by default only when the history has entries: an
 * empty history does not reserve the Secondary, so Overview uses the space. That default is taken
 * when the Overview mounts, so a refresh or a first event never moves the panel either.
 *
 * `toggle` is the one owner of the Primary header's history control. A contextual flow (a Task or
 * document preview) covers the history while it is shown, so the control then brings the history
 * forward instead of closing it.
 */
export function useActivityHistoryPanel(specId: string, hasEntries: boolean) {
  const { isOpen: flowVisible, close } = useSecondaryNavigation();
  const [choice, setOpen] = useHistoryPanelChoice(specId);
  const [defaultOpen] = useState(hasEntries);
  const open = choice ?? defaultOpen;
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
