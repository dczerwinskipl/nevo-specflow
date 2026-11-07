import { useSyncExternalStore } from 'react';
import { fillBelowViewportPx, growMaxPx, isA2Family, protoSnap } from './layoutPrototype';

/** PROTOTYPE: current viewport width, reactive to resizes. */
export function usePrototypeViewportWidth() {
  return useSyncExternalStore(
    (listener) => {
      globalThis.addEventListener?.('resize', listener);

      return () => globalThis.removeEventListener?.('resize', listener);
    },
    () => globalThis.innerWidth ?? 0,
    () => 0,
  );
}

/** PROTOTYPE (`proto.snap=fill`): whether Focused screens fill the workspace at this width. */
export function usePrototypeFillFocused() {
  const width = usePrototypeViewportWidth();

  return isA2Family && protoSnap === 'fill' && width > 0 && width < fillBelowViewportPx;
}

/**
 * PROTOTYPE (`proto.snap=grow`): the Focused frame width in px (workspace incl. its border), or null.
 * It follows the available width (navigation and gap subtracted) and stops at `growMaxPx`, so the
 * frame never jumps and only starts centring once it has reached its maximum.
 */
export function usePrototypeGrowFrame(): number | null {
  const width = usePrototypeViewportWidth();
  if (!isA2Family || protoSnap !== 'grow' || width - 268 <= 1102) {
    return null;
  }

  return Math.min(width - 268, growMaxPx);
}
