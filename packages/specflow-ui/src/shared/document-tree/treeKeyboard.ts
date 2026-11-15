/** One visible row of a tree, in reading order (the keyboard moves along these). */
export interface TreeKeyRow {
  readonly key: string;
  readonly kind: 'folder' | 'document';
  /** The folder's own path, or the document's id. */
  readonly id: string;
  /** The key of the folder holding the row; `undefined` at the top level. */
  readonly parentKey?: string;
}

/**
 * Where a tree key goes (roving tabindex): Up/Down to the neighbouring visible row, Home/End to
 * the first/last, Right into an expanded folder's first child, Left to the parent folder. Expanding
 * or collapsing (Right on a collapsed folder, Left on an expanded one) is the caller's: it keeps
 * focus on the row. `undefined` when the key moves nothing.
 */
export function treeKeyTarget(
  rows: readonly TreeKeyRow[],
  currentKey: string,
  key: string,
  expanded: ReadonlySet<string>,
): { readonly focus?: string; readonly toggle?: string } | undefined {
  const index = rows.findIndex((row) => row.key === currentKey);
  const row = rows[index];
  if (!row) {
    return undefined;
  }

  const focus = (target: TreeKeyRow | undefined) => (target ? { focus: target.key } : undefined);
  switch (key) {
    case 'ArrowDown':
      return focus(rows[index + 1]);
    case 'ArrowUp':
      return focus(rows[index - 1]);
    case 'Home':
      return focus(rows[0]);
    case 'End':
      return focus(rows.at(-1));
    case 'ArrowRight':
      if (row.kind !== 'folder') {
        return undefined;
      }

      return expanded.has(row.id)
        ? focus(rows[index + 1]?.parentKey === row.key ? rows[index + 1] : undefined)
        : { toggle: row.id };
    case 'ArrowLeft':
      if (row.kind === 'folder' && expanded.has(row.id)) {
        return { toggle: row.id };
      }

      return focus(rows.find((candidate) => candidate.key === row.parentKey));
    default:
      return undefined;
  }
}
