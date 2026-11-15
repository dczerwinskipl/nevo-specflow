import { describe, expect, it } from 'vitest';
import { treeKeyTarget, type TreeKeyRow } from './treeKeyboard';

// guide (open) > hub, z; Guide2 (closed); then a top-level document.
const rows: TreeKeyRow[] = [
  { key: 'folder:guide', kind: 'folder', id: 'guide' },
  { key: 'document:hub', kind: 'document', id: 'hub', parentKey: 'folder:guide' },
  { key: 'document:z', kind: 'document', id: 'z', parentKey: 'folder:guide' },
  { key: 'folder:Guide2', kind: 'folder', id: 'Guide2' },
  { key: 'document:b', kind: 'document', id: 'b' },
];
const expanded = new Set(['guide']);

describe('tree keyboard', () => {
  it('moves along the visible rows: arrows, Home/End, Right into a folder, Left to its parent', () => {
    expect(treeKeyTarget(rows, 'folder:guide', 'ArrowRight', expanded)).toEqual({
      focus: 'document:hub',
    });
    expect(treeKeyTarget(rows, 'folder:Guide2', 'ArrowRight', expanded)).toEqual({
      toggle: 'Guide2',
    });
    expect(treeKeyTarget(rows, 'document:z', 'ArrowLeft', expanded)).toEqual({
      focus: 'folder:guide',
    });
    expect(treeKeyTarget(rows, 'folder:guide', 'ArrowLeft', expanded)).toEqual({ toggle: 'guide' });
    expect(treeKeyTarget(rows, 'folder:guide', 'End', expanded)).toEqual({ focus: 'document:b' });
    expect(treeKeyTarget(rows, 'document:b', 'Home', expanded)).toEqual({ focus: 'folder:guide' });
    expect(treeKeyTarget(rows, 'document:z', 'ArrowDown', expanded)).toEqual({
      focus: 'folder:Guide2',
    });
    expect(treeKeyTarget(rows, 'document:b', 'ArrowDown', expanded)).toBeUndefined();
    expect(treeKeyTarget(rows, 'document:b', 'ArrowRight', expanded)).toBeUndefined();
  });
});
