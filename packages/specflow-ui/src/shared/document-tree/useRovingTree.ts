import { useState, type KeyboardEvent } from 'react';
import { treeKeyTarget, type TreeKeyRow } from './treeKeyboard';

/** What a row button takes to be part of the roving Tab stop. */
export interface TreeRowFocus {
  readonly tabIndex: number;
  readonly 'data-tree-key': string;
  readonly onFocus: () => void;
}

/**
 * The tree as one Tab stop (roving tabindex): the remembered row while it is visible, else
 * `preferredKey` (for example the open document), else the first row. Arrows, Home and End move
 * between the visible rows; Right and Left open and close folders (`onToggle`). Put `onKeyDown` on
 * the element around the rows and `rowFocus(key)` on each row.
 */
export function useRovingTree({
  rows,
  expanded,
  preferredKey,
  onToggle,
}: {
  rows: readonly TreeKeyRow[];
  expanded: ReadonlySet<string>;
  preferredKey?: string;
  onToggle: (folderId: string) => void;
}) {
  const [focusKey, setFocusKey] = useState<string>();
  const visible = (key: string | undefined) =>
    key !== undefined && rows.some((row) => row.key === key);
  // A remembered focus that is no longer visible (its folder collapsed) gives the stop back.
  const stopKey = visible(focusKey)
    ? focusKey
    : visible(preferredKey)
      ? preferredKey
      : rows[0]?.key;

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const currentKey = (event.target as HTMLElement).closest<HTMLElement>('[data-tree-key]')
      ?.dataset.treeKey;
    if (!currentKey) {
      return;
    }

    const target = treeKeyTarget(rows, currentKey, event.key, expanded);
    if (!target) {
      return;
    }

    event.preventDefault();
    if (target.toggle !== undefined) {
      setFocusKey(currentKey);
      onToggle(target.toggle);
    }

    if (target.focus !== undefined) {
      setFocusKey(target.focus);
      event.currentTarget
        .querySelector<HTMLElement>(`[data-tree-key="${CSS.escape(target.focus)}"]`)
        ?.focus();
    }
  };

  const rowFocus = (key: string): TreeRowFocus => ({
    tabIndex: stopKey === key ? 0 : -1,
    'data-tree-key': key,
    onFocus: () => setFocusKey(key),
  });

  return { onKeyDown, rowFocus };
}
