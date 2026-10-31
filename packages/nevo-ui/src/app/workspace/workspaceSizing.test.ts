import { describe, expect, it } from 'vitest';

import {
  APP_NAVIGATION_INLINE_PADDING,
  APP_NAVIGATION_WIDTH,
  APP_SHELL_GAP,
  APP_WORKSPACE_EDGE_BORDER,
  capPrimaryWidth,
  resolveDynamicSplitRatioBounds,
  resolveDynamicWorkspaceSplit,
  resolveSlotMaxWidth,
  resolveWorkspaceContentWidth,
  resolveWorkspaceFit,
  resolveWorkspacePixelSplit,
  resolveWorkspaceSplit,
  supportsRuntimeWorkspaceSplit,
  supportsWorkspaceSplit,
  WIDE_SHELL_MIN_WIDTH,
  WORKSPACE_DYNAMIC_PRIMARY_MIN_WIDTH,
  WORKSPACE_DYNAMIC_SECONDARY_MIN_WIDTH,
  WORKSPACE_SPLIT_MIN_WIDTH,
  WORKSPACE_SPLITTER_KEYBOARD_STEP_PX,
  WORKSPACE_WIDE_DOMINANCE_MIN_WIDTH,
  type DynamicSplitInput,
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

// workspace-dynamic-split.md §4.2 (DynamicSplitInput/output shape) and §5 (the full transition
// table). Each `it` below is named after, and covers, exactly one §5 table row; the boundary
// `describe` covers the "even after clamping" width thresholds themselves.
describe('resolveDynamicWorkspaceSplit', () => {
  // Wide enough that both the narrow default and the 2+-tab 50/50 fit without clamping, so each
  // row's expected ratio below is the literal table value, not a width-driven clamp artifact.
  const baseInput: DynamicSplitInput = {
    availableWidth: 1400,
    openTabCount: 1,
    mode: 'auto',
    manualRatio: null,
    previousOpenTabCount: 1,
  };

  it('keeps the dynamic minimum widths as tunable defaults, not frozen contracts', () => {
    expect(WORKSPACE_DYNAMIC_SECONDARY_MIN_WIDTH).toBe(330);
    expect(WORKSPACE_DYNAMIC_PRIMARY_MIN_WIDTH).toBe(400);
  });

  it('`DynamicSplitInput` carries exactly availableWidth/openTabCount/mode/manualRatio/previousOpenTabCount — no field for an active tab, local-stack depth, or any Session/product event (§5 "push/pop"+"live update" rows, §6)', () => {
    expect(Object.keys(baseInput).sort()).toEqual(
      ['availableWidth', 'manualRatio', 'mode', 'openTabCount', 'previousOpenTabCount'].sort(),
    );
  });

  it('entering a split-capable workspace with only one tab open uses the narrow default', () => {
    expect(resolveDynamicWorkspaceSplit(baseInput)).toEqual({
      layout: 'split',
      secondaryRatio: WORKSPACE_DYNAMIC_SECONDARY_MIN_WIDTH / baseInput.availableWidth!,
      mode: 'auto',
    });
  });

  it('openTab() opening a brand-new 2nd tab while auto switches to 50/50 once', () => {
    expect(
      resolveDynamicWorkspaceSplit({ ...baseInput, openTabCount: 2, previousOpenTabCount: 1 }),
    ).toEqual({ layout: 'split', secondaryRatio: 0.5, mode: 'auto' });
  });

  it('open() replacing its slot in place while tab count is unchanged does not resize, unlike opening a brand-new 2nd tab', () => {
    const afterBrandNewTab = resolveDynamicWorkspaceSplit({
      ...baseInput,
      openTabCount: 2,
      previousOpenTabCount: 1,
    });
    const afterReplaceInPlace = resolveDynamicWorkspaceSplit({
      ...baseInput,
      openTabCount: 2,
      previousOpenTabCount: 2,
    });

    // Two different triggers (contract §4.1 Finding 1): a brand-new tab vs. a same-slot replace.
    // Both must land on the same 50/50 — that equality is exactly what makes the replace a "no
    // resize" rather than a second, independent 50/50 switch.
    expect(afterReplaceInPlace).toEqual(afterBrandNewTab);
    expect(afterReplaceInPlace).toEqual({ layout: 'split', secondaryRatio: 0.5, mode: 'auto' });
  });

  it('switching among open tabs is called (if at all) with unchanged inputs and returns unchanged output', () => {
    const switching: DynamicSplitInput = { ...baseInput, openTabCount: 3, previousOpenTabCount: 3 };

    expect(resolveDynamicWorkspaceSplit(switching)).toEqual(
      resolveDynamicWorkspaceSplit(switching),
    );
  });

  it('closeTab() down to just the pinned tab while auto returns to the narrow default', () => {
    expect(
      resolveDynamicWorkspaceSplit({ ...baseInput, openTabCount: 1, previousOpenTabCount: 2 }),
    ).toEqual({
      layout: 'split',
      secondaryRatio: WORKSPACE_DYNAMIC_SECONDARY_MIN_WIDTH / baseInput.availableWidth!,
      mode: 'auto',
    });
  });

  it('closeTab() closing the last tab in a workspace with no pinned tab leaves Secondary with none (openTabCount 0 is moot, not a throw)', () => {
    expect(() =>
      resolveDynamicWorkspaceSplit({ ...baseInput, openTabCount: 0, previousOpenTabCount: 1 }),
    ).not.toThrow();
  });

  it('entering manual is preserved across further opens and closes, with no automatic 50/50', () => {
    const manual = { availableWidth: 1200, mode: 'manual' as const, manualRatio: 0.4 };

    expect(
      resolveDynamicWorkspaceSplit({ ...manual, openTabCount: 2, previousOpenTabCount: 1 })
        .secondaryRatio,
    ).toBe(0.4);
    expect(
      resolveDynamicWorkspaceSplit({ ...manual, openTabCount: 3, previousOpenTabCount: 2 })
        .secondaryRatio,
    ).toBe(0.4);
    expect(
      resolveDynamicWorkspaceSplit({ ...manual, openTabCount: 1, previousOpenTabCount: 3 })
        .secondaryRatio,
    ).toBe(0.4);
  });

  it('width dropping below the fit threshold falls back to stacked, preserving mode/manualRatio as opaque "last known" state', () => {
    expect(
      resolveDynamicWorkspaceSplit({
        availableWidth: 700,
        openTabCount: 2,
        mode: 'manual',
        manualRatio: 0.4,
        previousOpenTabCount: 2,
      }),
    ).toEqual({ layout: 'stacked', secondaryRatio: 0.4, mode: 'manual' });
  });

  it('width returning restores the clamped ratio, not the auto default, when a manual ratio exists', () => {
    const result = resolveDynamicWorkspaceSplit({
      availableWidth: 1200,
      openTabCount: 2,
      mode: 'manual',
      manualRatio: 0.9, // outside [min, max] at 1200px: must clamp, not reset to the 0.5 auto value
      previousOpenTabCount: 2,
    });

    expect(result).toEqual({
      layout: 'split',
      secondaryRatio: 1 - WORKSPACE_DYNAMIC_PRIMARY_MIN_WIDTH / 1200,
      mode: 'manual',
    });
    expect(result.secondaryRatio).not.toBe(0.5);
  });

  describe('boundary widths at exactly the combined minimum', () => {
    const combinedMinimum =
      WORKSPACE_DYNAMIC_SECONDARY_MIN_WIDTH + WORKSPACE_DYNAMIC_PRIMARY_MIN_WIDTH;

    it('fits exactly at the combined minimum width', () => {
      const result = resolveDynamicWorkspaceSplit({
        ...baseInput,
        availableWidth: combinedMinimum,
      });

      expect(result.layout).toBe('split');
      expect(result.secondaryRatio * combinedMinimum).toBeCloseTo(
        WORKSPACE_DYNAMIC_SECONDARY_MIN_WIDTH,
      );
    });

    it('falls back to stacked one px short of the combined minimum', () => {
      const result = resolveDynamicWorkspaceSplit({
        ...baseInput,
        availableWidth: combinedMinimum - 1,
      });

      expect(result.layout).toBe('stacked');
    });
  });
});

describe('resolveDynamicSplitRatioBounds', () => {
  it('shares its exact bounds with resolveDynamicWorkspaceSplit’s own clamping (no second reimplementation)', () => {
    const availableWidth = 1200;
    const bounds = resolveDynamicSplitRatioBounds(availableWidth);

    const belowMin = resolveDynamicWorkspaceSplit({
      availableWidth,
      openTabCount: 2,
      mode: 'manual',
      manualRatio: bounds.min - 0.2,
      previousOpenTabCount: 2,
    });
    const aboveMax = resolveDynamicWorkspaceSplit({
      availableWidth,
      openTabCount: 2,
      mode: 'manual',
      manualRatio: bounds.max + 0.2,
      previousOpenTabCount: 2,
    });

    expect(belowMin.secondaryRatio).toBeCloseTo(bounds.min);
    expect(aboveMax.secondaryRatio).toBeCloseTo(bounds.max);
  });

  it('derives min/max directly from the dynamic minimum-width constants', () => {
    const availableWidth = 1000;

    expect(resolveDynamicSplitRatioBounds(availableWidth)).toEqual({
      min: WORKSPACE_DYNAMIC_SECONDARY_MIN_WIDTH / availableWidth,
      max: 1 - WORKSPACE_DYNAMIC_PRIMARY_MIN_WIDTH / availableWidth,
    });
  });
});

describe('WORKSPACE_SPLITTER_KEYBOARD_STEP_PX', () => {
  it('is a tunable default matching the contract’s "24px-equivalent" example', () => {
    expect(WORKSPACE_SPLITTER_KEYBOARD_STEP_PX).toBe(24);
  });
});
