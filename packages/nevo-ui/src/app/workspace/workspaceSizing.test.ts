import { describe, expect, it } from 'vitest';

import {
  APP_NAVIGATION_INLINE_PADDING,
  APP_NAVIGATION_WIDTH,
  APP_SHELL_GAP,
  resolveSlotMaxWidth,
  resolveWorkspacePixelSplit,
  resolveWorkspaceSplit,
  supportsRuntimeWorkspaceSplit,
  supportsWorkspaceSplit,
  WIDE_SHELL_MIN_WIDTH,
  WORKSPACE_SPLIT_MIN_WIDTH,
  WORKSPACE_WIDE_DOMINANCE_MIN_WIDTH,
} from './workspaceSizing';

describe('responsive workspace thresholds', () => {
  it('keeps persistent navigation monotonic with split workspace capacity', () => {
    expect(APP_NAVIGATION_WIDTH).toBe(260);
    expect(APP_NAVIGATION_INLINE_PADDING).toBe(16);
    expect(APP_SHELL_GAP).toBe(8);
    expect(WORKSPACE_SPLIT_MIN_WIDTH).toBe(840);
    expect(WORKSPACE_WIDE_DOMINANCE_MIN_WIDTH).toBe(1080);
    expect(WIDE_SHELL_MIN_WIDTH).toBe(
      WORKSPACE_SPLIT_MIN_WIDTH + APP_NAVIGATION_WIDTH + APP_SHELL_GAP,
    );
  });

  it('treats unknown and narrow workspace widths as stacked', () => {
    expect(supportsWorkspaceSplit(undefined)).toBe(false);
    expect(supportsWorkspaceSplit(WORKSPACE_SPLIT_MIN_WIDTH - 1)).toBe(false);
    expect(supportsWorkspaceSplit(WORKSPACE_SPLIT_MIN_WIDTH)).toBe(true);
    expect([480, 900, 480].map(supportsWorkspaceSplit)).toEqual([false, true, false]);
  });

  it('keeps runtime split capacity independent from navigation mode', () => {
    expect(supportsRuntimeWorkspaceSplit(WORKSPACE_SPLIT_MIN_WIDTH - 1)).toBe(false);
    expect(supportsRuntimeWorkspaceSplit(WORKSPACE_SPLIT_MIN_WIDTH)).toBe(true);
    expect(supportsRuntimeWorkspaceSplit(960)).toBe(true);
    expect(supportsRuntimeWorkspaceSplit(1400)).toBe(true);
  });
});

describe('resolveWorkspaceSplit', () => {
  it('uses the entire workspace when there is no secondary panel', () => {
    expect(resolveWorkspaceSplit('primary', false)).toEqual({
      primary: 100,
      secondary: 0,
    });
  });

  it.each([
    ['primary', 75, 25],
    ['balanced', 50, 50],
    ['secondary', 25, 75],
  ] as const)('maps the wide %s split to %i/%i', (split, primary, secondary) => {
    expect(resolveWorkspaceSplit(split, true, 1124)).toEqual({
      primary,
      secondary,
    });
  });

  it.each([
    ['primary', 2],
    ['secondary', 0.5],
  ] as const)('uses a 2:1 relationship for the medium %s split', (split, ratio) => {
    const resolved = resolveWorkspaceSplit(split, true, 960);
    expect(resolved.primary / resolved.secondary).toBeCloseTo(ratio);
  });

  it('keeps balanced layouts balanced at every split-capable width', () => {
    expect(resolveWorkspaceSplit('balanced', true, 960)).toEqual({
      primary: 50,
      secondary: 50,
    });
  });

  it('switches dominant layouts from 2:1 to 3:1 at the wide-workspace threshold', () => {
    const medium = resolveWorkspaceSplit('primary', true, WORKSPACE_WIDE_DOMINANCE_MIN_WIDTH - 1);
    const wide = resolveWorkspaceSplit('primary', true, WORKSPACE_WIDE_DOMINANCE_MIN_WIDTH);

    expect(medium.primary / medium.secondary).toBeCloseTo(2);
    expect(wide).toEqual({ primary: 75, secondary: 25 });
  });
});

describe('resolveSlotMaxWidth', () => {
  it('turns a share into a concrete pixel cap', () => {
    expect(resolveSlotMaxWidth(1200, 75)).toBe(900);
    expect(resolveSlotMaxWidth(1200, 25)).toBe(300);
  });

  it('stays unresolved until the workspace is measured', () => {
    expect(resolveSlotMaxWidth(undefined, 50)).toBeUndefined();
  });
});

describe('resolveWorkspacePixelSplit', () => {
  it('derives a medium 2:1 pixel split', () => {
    const resolved = resolveWorkspacePixelSplit(960, 'primary', true);
    expect(resolved.primary).toBeCloseTo(640);
    expect(resolved.secondary).toBeCloseTo(320);
  });

  it.each([
    ['primary', true, { primary: 843, secondary: 281 }],
    ['balanced', true, { primary: 562, secondary: 562 }],
    ['secondary', true, { primary: 281, secondary: 843 }],
    ['primary', false, { primary: 1124 }],
  ] as const)('derives the %s layout from one canonical width', (split, hasSecondary, expected) => {
    expect(resolveWorkspacePixelSplit(1124, split, hasSecondary)).toEqual(expected);
  });
});
