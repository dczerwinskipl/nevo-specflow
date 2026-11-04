import { useCallback, useEffect, useRef, useState } from 'react';

import {
  resolveDynamicSplitRatioBounds,
  resolveDynamicWorkspaceSplit,
  WORKSPACE_DYNAMIC_PRIMARY_MIN_WIDTH,
  WORKSPACE_DYNAMIC_SECONDARY_MIN_WIDTH,
  type DynamicSplitRatioBounds,
} from './workspaceSizing';

/**
 * `split="dynamic"`'s sizing branch (workspace-dynamic-split.md §4.2), consuming
 * `resolveDynamicWorkspaceSplit`. `mode`/`manualRatio` are the resolver's own owned state
 * (contract §3 items 4-5), held here as real React state: `AppWorkspace` starts in `'auto'` mode
 * and enters `'manual'` the first time `setManualRatio` is called — by `WorkspaceSplitter`'s
 * pointer/touch drag or keyboard adjustment. This is deliberately **not** a second stacked
 * rendering path: it only decides `layout`/`secondaryRatio`; the caller renders the result.
 *
 * Ratio contract:
 * - Uncontrolled (`secondaryRatioProp` omitted): the resolver's auto/manual value is rendered, and
 *   every change of `(ratio, mode)` is reported once the width has been measured.
 * - Controlled (`secondaryRatioProp` given): the product's value is a manual preference that goes
 *   through the same resolver (`mode: 'manual'`), so what is rendered — and what the splitter
 *   announces — is always clamped into the valid range for the measured width, and the layout is
 *   stacked when the width cannot hold both minimum panes. The preference itself is never
 *   rewritten by auto values, by a width change, or by the first render: only a user adjustment
 *   (reported as `'manual'`) or a later controlled value that is out of range for the current width
 *   (reported once, as its clamped value) produces a callback.
 * - Nothing is reported before the width is measured (a guess would overwrite a restored value).
 *
 * Live/product-event non-resize is structural here, not merely tested: the only values this
 * function reads are `availableWidth` (from the existing `ResizeObserver`-driven measurement) and
 * `openTabCount` (a plain count, never an active tab's identity or its local-stack depth) — there
 * is no Session/product subscription anywhere in this file.
 */
export function useDynamicWorkspaceSplit(
  availableWidth: number | undefined,
  openTabCount: number,
  secondaryRatioProp: number | undefined,
  onSecondaryRatioChange: ((ratio: number, mode: 'auto' | 'manual') => void) | undefined,
  enabled: boolean,
  scopeGeneration = 0,
): {
  layout: 'split' | 'stacked';
  secondaryRatio: number;
  bounds?: DynamicSplitRatioBounds;
  setManualRatio: (ratio: number) => void;
} {
  const [mode, setMode] = useState<'auto' | 'manual'>('auto');
  const [manualRatio, setManualRatioState] = useState<number | null>(null);
  // Contract §3: `mode`/`manualRatio` are per `scopeKey` and reset when it changes. The provider's
  // scope generation says so even while this workspace stays mounted; adjust during render, so the
  // new scope never renders one frame with the old scope's manual ratio.
  const [seenScopeGeneration, setSeenScopeGeneration] = useState(scopeGeneration);
  if (seenScopeGeneration !== scopeGeneration) {
    setSeenScopeGeneration(scopeGeneration);
    setMode('auto');
    setManualRatioState(null);
  }

  const controlled = secondaryRatioProp !== undefined;
  const measured = availableWidth !== undefined;

  const previousOpenTabCountRef = useRef(openTabCount);
  const result = resolveDynamicWorkspaceSplit({
    availableWidth,
    openTabCount,
    mode: controlled ? 'manual' : mode,
    manualRatio: controlled ? secondaryRatioProp : manualRatio,
    previousOpenTabCount: previousOpenTabCountRef.current,
  });
  const bounds =
    availableWidth !== undefined &&
    availableWidth >= WORKSPACE_DYNAMIC_SECONDARY_MIN_WIDTH + WORKSPACE_DYNAMIC_PRIMARY_MIN_WIDTH
      ? resolveDynamicSplitRatioBounds(availableWidth)
      : undefined;

  // The latest callback, read from effects without re-running them when a product passes a fresh
  // inline function each render.
  const onChangeRef = useRef(onSecondaryRatioChange);
  useEffect(() => {
    onChangeRef.current = onSecondaryRatioChange;
  });

  useEffect(() => {
    previousOpenTabCountRef.current = openTabCount;
  }, [openTabCount]);

  // Uncontrolled: report the resolver's own value (the product only observes it).
  useEffect(() => {
    if (enabled && !controlled && measured) {
      onChangeRef.current?.(result.secondaryRatio, result.mode);
    }
  }, [enabled, controlled, measured, result.secondaryRatio, result.mode]);

  // Controlled: the first measured value is a restored preference, not corrected. A later value
  // that the current width cannot honour is reported once as its clamped value.
  const lastControlledRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!enabled || !controlled || !measured) {
      return;
    }

    if (lastControlledRef.current === undefined) {
      lastControlledRef.current = secondaryRatioProp;

      return;
    }

    if (lastControlledRef.current === secondaryRatioProp) {
      return;
    }

    lastControlledRef.current = secondaryRatioProp;
    if (result.layout === 'split' && Math.abs(result.secondaryRatio - secondaryRatioProp) > 1e-6) {
      onChangeRef.current?.(result.secondaryRatio, 'manual');
    }
  }, [enabled, controlled, measured, secondaryRatioProp, result.layout, result.secondaryRatio]);

  // A drag/keyboard adjustment always enters 'manual' (contract §5/§7). Uncontrolled, this state
  // wins and the effect above reports it; controlled, the product's own value wins, so the user's
  // change is reported directly and the product echoes it back through `secondaryRatio`.
  const setManualRatio = useCallback(
    (ratio: number) => {
      setMode('manual');
      setManualRatioState(ratio);
      if (controlled) {
        onChangeRef.current?.(ratio, 'manual');
      }
    },
    [controlled],
  );

  return {
    layout: result.layout,
    secondaryRatio: result.secondaryRatio,
    bounds,
    setManualRatio,
  };
}
