import { useRef } from 'react';
import type { TreeFocus } from './tree/useTreeFocus';

/**
 * Where focus goes when an explorer dialog closes: back to the control that opened it, or, when
 * the result decides (the next row after a removal), to that row.
 */
export function useDialogFocus(focus: TreeFocus) {
  const opener = useRef<HTMLElement | null>(null);
  const closedByResult = useRef(false);

  /**
   * Remembers the control that opened a dialog (Add, a row's menu trigger, the tab's button). A
   * dialog opened from the header menu returns to the tree instead. Written in event handlers only.
   */
  const rememberOpener = () => {
    const active = globalThis.document.activeElement;
    opener.current =
      active instanceof HTMLElement &&
      active !== globalThis.document.body &&
      !active.closest('[data-workspace-header]')
        ? active
        : null;
  };

  const restoreOpener = () =>
    requestAnimationFrame(() => {
      if (opener.current?.isConnected) {
        opener.current.focus();
      } else {
        focus.request('folder:');
      }

      opener.current = null;
    });

  return {
    rememberOpener,
    /** The dialog unmounts on its own: its focus restoration cannot run, so the opener gets focus. */
    restoreOpener,
    /** The dialog ended with a result: nothing is restored to the opener. */
    forgetOpener: () => {
      opener.current = null;
    },
    /** The result decides where focus goes (for example the next row), not the opener. */
    focusResult: (key: string) => {
      opener.current = null;
      closedByResult.current = true;
      focus.request(key);
    },
    onCloseAutoFocus: (event: Event) => {
      // Only the dialogs that remembered their opener decide focus; the others keep Radix's.
      if (!opener.current && !closedByResult.current) {
        return;
      }

      event.preventDefault();
      if (!closedByResult.current) {
        restoreOpener();
      }

      closedByResult.current = false;
    },
  };
}
