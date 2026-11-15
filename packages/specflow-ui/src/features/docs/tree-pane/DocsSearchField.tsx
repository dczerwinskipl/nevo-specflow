import { useEffect, useRef, type Ref } from 'react';
import { useWorkspaceCapabilities } from '@nevo/ui';
import { TreeSearchField } from '../../../shared/document-tree';

/** Touch is the primary input: the field is typed on a software keyboard (as in the switchers). */
const touchPrimaryInputQuery = '(pointer: coarse)';

/** The nearest ancestor that scrolls vertically: the tree pane's scroller. */
function scrollerOf(element: HTMLElement): HTMLElement | undefined {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === 'auto' || overflowY === 'scroll') {
      return node;
    }
  }

  return undefined;
}

/**
 * The tree pane's search field in its sticky block: the only part of the pane that stays at the top
 * of the scroller, on an opaque surface with a divider under it (always drawn, no stuck detection).
 * The block covers the pane content's padding, so nothing scrolled underneath shows beside it, and
 * cancels its own padding with negative margins, so the field sits where it would without it.
 *
 * The software keyboard: on Narrow, focusing the field scrolls the pane so the field is at the top
 * (the picker leaves the view while typing). The keyboard closes, keeping the text, on Enter (touch
 * only; a hardware keyboard keeps its focus) and when a touch drag starts outside the block, which
 * scrolls the results. Opening a result closes it too (`DocsSearchPanel`).
 */
export function DocsSearchField({
  inputRef,
  label,
  maxLength,
  value,
  onChange,
  onClear,
}: {
  inputRef: Ref<HTMLInputElement>;
  label: string;
  maxLength: number;
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
}) {
  const block = useRef<HTMLDivElement>(null);
  const { supportsSplit } = useWorkspaceCapabilities();

  // A touch drag is the document's (an external system): while the field holds the keyboard, a
  // drag that starts outside the block scrolls the results, and the keyboard gives way to them.
  useEffect(() => {
    const dismiss = (event: TouchEvent) => {
      const input = document.activeElement;
      if (
        input instanceof HTMLInputElement &&
        block.current?.contains(input) &&
        !(event.target instanceof Node && block.current.contains(event.target))
      ) {
        input.blur();
      }
    };

    document.addEventListener('touchmove', dismiss, { passive: true });

    return () => document.removeEventListener('touchmove', dismiss);
  }, []);

  return (
    <div
      ref={block}
      role="search"
      className="sticky top-0 z-10 -mx-2 -my-2 border-b border-divider bg-surface-raised px-3 py-2"
      onFocus={(event) => {
        const node = event.currentTarget;
        const scroller = scrollerOf(node);
        if (supportsSplit || !(event.target instanceof HTMLInputElement) || !scroller) {
          return;
        }

        // Only down to the field's own place: a stuck field is at the top already.
        const offset = node.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
        if (offset > 0) {
          scroller.scrollTo({ top: scroller.scrollTop + offset });
        }
      }}
      onKeyDown={(event) => {
        if (
          event.key === 'Enter' &&
          event.target instanceof HTMLInputElement &&
          window.matchMedia(touchPrimaryInputQuery).matches
        ) {
          event.preventDefault();
          event.target.blur();
        }
      }}
    >
      <TreeSearchField
        inputRef={inputRef}
        label={label}
        maxLength={maxLength}
        value={value}
        onChange={onChange}
        onClear={onClear}
      />
    </div>
  );
}
