import { describe, expect, it } from 'vitest';

import {
  APP_NAVIGATION_INLINE_PADDING,
  APP_NAVIGATION_WIDTH,
  APP_SHELL_GAP,
  APP_WORKSPACE_EDGE_BORDER,
  capPrimaryWidth,
  resolveSlotMaxWidth,
  resolveWorkspaceContentWidth,
  resolveWorkspaceFit,
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

describe('resolveWorkspaceFit', () => {
  it.each([
    ['content', 'split', true, 'content'],
    ['content', 'split', false, 'available'],
    ['content', 'stacked', true, 'available'],
    ['available', 'split', true, 'available'],
    ['available', 'split', false, 'available'],
    ['bounded', 'split', false, 'content'],
    ['bounded', 'split', true, 'content'],
    ['bounded', 'stacked', false, 'available'],
  ] as const)(
    'fit=%s in %s layout (secondary: %s) resolves to %s',
    (fit, mode, secondary, expected) => {
      expect(resolveWorkspaceFit(fit, mode, secondary)).toBe(expected);
    },
  );
});

describe('resolveWorkspaceFit with a drawer navigation', () => {
  it('fills a bounded workspace (no bare strip beside it) and leaves the other fits alone', () => {
    expect(resolveWorkspaceFit('bounded', 'split', false, 'drawer')).toBe('available');
    expect(resolveWorkspaceFit('bounded', 'split', false, 'persistent')).toBe('content');
    expect(resolveWorkspaceFit('content', 'split', true, 'drawer')).toBe('content');
  });
});

describe('resolveWorkspaceContentWidth', () => {
  it('removes one edge border for an edge-fit surface and two for an inset one', () => {
    expect(APP_WORKSPACE_EDGE_BORDER).toBe(1);
    expect(resolveWorkspaceContentWidth(1172, { bordered: true, inset: false })).toBe(1171);
    expect(resolveWorkspaceContentWidth(1172, { bordered: true, inset: true })).toBe(1170);
  });

  it('keeps unbordered and unknown widths, and never goes negative', () => {
    expect(resolveWorkspaceContentWidth(900, { bordered: false, inset: false })).toBe(900);
    expect(
      resolveWorkspaceContentWidth(undefined, { bordered: true, inset: true }),
    ).toBeUndefined();
    expect(resolveWorkspaceContentWidth(1, { bordered: true, inset: true })).toBe(0);
  });

  it('makes primary + secondary fit the content box at 25/75 and 50/50 splits', () => {
    for (const split of ['primary', 'balanced', 'secondary'] as const) {
      const content = resolveWorkspaceContentWidth(1172, { bordered: true, inset: false })!;
      const pixels = resolveWorkspacePixelSplit(content, split, true);
      expect(pixels.primary + pixels.secondary!).toBeCloseTo(content);
    }
  });
});

describe('capPrimaryWidth', () => {
  const widths = { primary: 640, secondary: 1920 };

  it('stops Primary at the cap and gives the rest to Secondary', () => {
    expect(capPrimaryWidth(2560, widths, 360)).toEqual({ primary: 360, secondary: 2200 });
  });

  it('changes nothing below the cap, without a cap, without Secondary or without a width', () => {
    expect(capPrimaryWidth(2560, widths, 800)).toBe(widths);
    expect(capPrimaryWidth(2560, widths, undefined)).toBe(widths);
    const alone = { primary: 2560 };
    expect(capPrimaryWidth(2560, alone, 360)).toBe(alone);
    expect(capPrimaryWidth(undefined, widths, 360)).toBe(widths);
  });

  it('does not touch a Primary exactly at the cap', () => {
    expect(capPrimaryWidth(2560, { primary: 360, secondary: 2200 }, 360)).toEqual({
      primary: 360,
      secondary: 2200,
    });
  });

  it('ignores a cap wider than the whole content width', () => {
    const narrow = { primary: 280, secondary: 560 };
    expect(capPrimaryWidth(840, narrow, 5000)).toBe(narrow);
  });

  it('gives everything but the cap to Secondary, never a negative width', () => {
    expect(capPrimaryWidth(800, { primary: 800, secondary: 0 }, 0)).toEqual({
      primary: 0,
      secondary: 800,
    });
  });

  it('keeps primary + secondary equal to the content width', () => {
    const capped = capPrimaryWidth(1171, { primary: 292.75, secondary: 878.25 }, 360);
    expect(capped.primary! + capped.secondary!).toBeCloseTo(1171);
  });
});
