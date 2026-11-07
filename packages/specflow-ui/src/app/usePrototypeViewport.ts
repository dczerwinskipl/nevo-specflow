import { useSyncExternalStore } from 'react';
import { fillBelowViewportPx, isA2Family, protoSnap } from './layoutPrototype';

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
