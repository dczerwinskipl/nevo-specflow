import { useEffect, useRef, type Ref } from 'react';
import { useWorkspaceCapabilities } from '@nevo/ui';
import { TreeSearchBar, TreeSearchField } from '../../../shared/document-tree';

/** Touch is the primary input: the field is typed on a software keyboard (as in the switchers). */
const touchPrimaryInputQuery = '(pointer: coarse)';

/**
 * The tree pane's search field in a sticky `TreeSearchBar`: the only part of the pane that stays at
 * the top of the scroller; docked there it takes the opaque docked surface and its divider.
 *
 * The software keyboard: on Narrow, focusing the field scrolls the pane so the field is at the top
 * (the picker leaves the view while typing). The keyboard closes, keeping the text, on Enter (touch
 * only; a hardware keyboard keeps its focus) and when a touch drag starts outside the block, which
 * scrolls the results. Opening a result closes it too (`DocsSearchPanel`).
 */
export function DocsSearchField({
  inputRef,
  scrollRoot,
  label,
  maxLength,
  value,
  onChange,
  onClear,
}: {
  inputRef: Ref<HTMLInputElement>;
  /** The pane's scroll viewport: the bar docks in it, and focusing the field scrolls it. */
  scrollRoot: HTMLElement | null;
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
    <TreeSearchBar
      ref={block}
      sticky
      scrollRoot={scrollRoot}
      onFocus={(event) => {
        const node = event.currentTarget;
        if (supportsSplit || !(event.target instanceof HTMLInputElement) || !scrollRoot) {
          return;
        }

        // Only down to the field's own place: a stuck field is at the top already.
        const offset = node.getBoundingClientRect().top - scrollRoot.getBoundingClientRect().top;
        if (offset > 0) {
          scrollRoot.scrollTo({ top: scrollRoot.scrollTop + offset });
        }
      }}
      onKeyDown={(event) => {
        if (
          event.key === 'Enter' &&
          // An Enter that confirms an IME composition is not a search.
          !event.nativeEvent.isComposing &&
          event.target instanceof HTMLInputElement &&
          window.matchMedia(touchPrimaryInputQuery).matches
        ) {
          event.preventDefault();
          event.target.blur();
        }
      }}
    >
      <TreeSearchField
        className="flex-1"
        inputRef={inputRef}
        label={label}
        maxLength={maxLength}
        value={value}
        onChange={onChange}
        onClear={onClear}
      />
    </TreeSearchBar>
  );
}
