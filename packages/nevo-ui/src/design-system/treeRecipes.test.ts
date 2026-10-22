import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  treeBranchClassName,
  treeHintClassName,
  treeItemClassName,
  treeItemLabelClassName,
  treeItemLabelTruncateClassName,
  treeLeafItemClassName,
  treeNodeClassName,
  treeRequiredLabelClassName,
  treeRequiredMarkerClassName,
  treeRootClassName,
  treeRowActionClassName,
  treeRowClassName,
} from './treeRecipes';

describe('compact tree geometry', () => {
  it('derives the row, indent, gap and offsets from control and icon tokens', async () => {
    const css = (await readFile('src/design-system.css', 'utf8')).replace(/\s+/g, ' ');
    // One compact control height; touch grows the hit area, never the row.
    expect(css).toContain('--spacing-tree-row-height: var(--spacing-control-height-compact);');
    expect(css).not.toMatch(/--spacing-tree-row-height:[^;]*target-size/);
    expect(css).toContain('--spacing-tree-gap: calc(var(--spacing) * 1.5);');
    // One small indent step per level: a single glyph slot.
    expect(css).toContain('--spacing-tree-indent: var(--spacing-icon-md);');
    expect(css).toContain(
      '--spacing-tree-leaf-offset: calc(var(--spacing-icon-md) + var(--spacing-tree-gap));',
    );
    expect(css).toMatch(
      /--spacing-tree-name-offset: calc\( 1px \+ var\(--spacing-control-padding-inline\) \+ var\(--spacing-icon-md\) \* 2 \+ var\(--spacing-tree-gap\) \* 2 \);/,
    );
  });

  it('uses only tokens for geometry and draws no guide lines', () => {
    const all = [
      treeBranchClassName,
      treeNodeClassName,
      treeRowClassName,
      treeItemClassName,
      treeLeafItemClassName,
      treeHintClassName,
    ].join(' ');
    expect(all).not.toMatch(/\d(?:\.\d+)?(?:px|rem)/);
    expect(all).not.toMatch(/before:|after:bg-|border-default/);
    expect(treeBranchClassName).toContain('pl-tree-indent');
    expect(treeRootClassName).not.toMatch(/pl-/);
    expect(treeItemClassName).toContain('min-h-tree-row-height');
    expect(treeItemClassName).toContain('gap-tree-gap');
    expect(treeLeafItemClassName).toContain('ml-tree-leaf-offset');
    expect(treeHintClassName).toContain('pl-tree-name-offset');
  });

  it('keeps the DS hit area on the item instead of tall padding', () => {
    expect(treeItemClassName).toContain('after:h-[max(100%,var(--target-size))]');
    expect(treeItemClassName).not.toMatch(/(^|\s)py-/);
  });
});

describe('tree selection and focus', () => {
  it('styles selection through aria-current and avoids local focus outlines', () => {
    expect(treeItemClassName).toContain(
      '[&[aria-current]:not([aria-current=false])]:bg-surface-selected',
    );
    expect(treeItemClassName).not.toMatch(/outline/);
    expect(treeItemClassName).not.toContain('aria-pressed');
  });

  it('keeps hover a lighter state than the selected tint', () => {
    expect(treeItemClassName).toContain('hover:bg-surface-hover');
    expect(treeItemClassName).toContain('bg-surface-selected');
  });
});

describe('tree row actions and labels', () => {
  it('reveals the action slot on fine pointers only and keeps it in layout', () => {
    expect(treeRowActionClassName).toContain('shrink-0');
    expect(treeRowActionClassName).toContain('pointer-fine:opacity-0');
    for (const reveal of [
      'pointer-fine:group-hover/tree-row:opacity-100',
      'pointer-fine:group-focus-within/tree-row:opacity-100',
      'pointer-fine:group-has-[[aria-current]:not([aria-current=false])]/tree-row:opacity-100',
      'pointer-fine:data-[state=open]:opacity-100',
      'pointer-fine:focus-visible:opacity-100',
    ])
      expect(treeRowActionClassName).toContain(reveal);
    expect(treeRowActionClassName).not.toMatch(/(^|\s)(opacity-0|hidden|invisible|sr-only)/);
    expect(treeRowActionClassName).not.toMatch(/(^|\s)pointer-fine:(hidden|invisible)/);
    // The action is a control-height IconButton: no row-pitch margin hack.
    expect(treeRowActionClassName).not.toMatch(/(^|\s)-?m[tby]-/);
  });

  it('names the row group and the row container', () => {
    expect(treeRowClassName).toContain('group/tree-row');
    expect(treeRowClassName).toContain('@container/tree-row');
    expect(treeRowClassName).toContain('items-center');
  });

  it('truncates labels', () => {
    expect(treeItemLabelTruncateClassName).toContain('truncate');
    expect(treeItemLabelTruncateClassName).toContain('min-w-0');
    expect(treeItemLabelClassName).not.toContain('truncate');
  });

  it('renders the required marker as quiet muted text that swaps with an icon on narrow rows', () => {
    expect(treeRequiredLabelClassName).toContain('text-content-muted');
    expect(treeRequiredLabelClassName).toContain('@max-3xs/tree-row:sr-only');
    expect(treeRequiredLabelClassName).not.toMatch(/rounded|bg-/);
    expect(treeRequiredMarkerClassName).toContain('@3xs/tree-row:hidden');
    expect(`${treeRequiredLabelClassName} ${treeRequiredMarkerClassName}`).not.toMatch(
      /\d(?:\.\d+)?(?:px|rem)|-m[yt]-/,
    );
  });

  it('keeps the empty-folder hint quiet: muted, no guide, aligned by token', () => {
    expect(treeHintClassName).toContain('text-content-muted');
    expect(treeHintClassName).not.toMatch(/before:|after:|min-h-/);
  });
});
