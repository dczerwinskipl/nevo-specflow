import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

/**
 * The part of the layout viewport the on-screen keyboard (or any other UA chrome that only shrinks
 * the VISUAL viewport) covers. Android Chrome (108+, `interactive-widget=resizes-visual`) and iOS
 * Safari do not resize the layout viewport when the keyboard opens, so `fixed` surfaces keep their
 * position behind it; `window.visualViewport` is the authoritative source for what is really visible.
 */
export interface VisualViewportInset {
  /** Pixels of the layout viewport hidden below the visual viewport (the keyboard height). */
  inset: number;
  /** Height of the visual viewport, i.e. the visible area. */
  height: number;
  /** Distance from the layout viewport top to the visual viewport top (iOS scrolls the page). */
  offsetTop: number;
}

/** Below this the difference is browser chrome noise (URL bar, rounding), not a keyboard. */
const MIN_KEYBOARD_INSET = 80;
/** Pinch-zoom also shrinks the visual viewport; it is not a keyboard. */
const MAX_ZOOM_SCALE = 1.01;

function readInset(): VisualViewportInset | null {
  if (typeof window === 'undefined' || !window.visualViewport) {
    return null;
  }

  const { height, offsetTop, scale } = window.visualViewport;
  if (scale > MAX_ZOOM_SCALE) {
    return null;
  }

  const inset = window.innerHeight - height - offsetTop;

  return inset >= MIN_KEYBOARD_INSET ? { inset, height, offsetTop } : null;
}

function sameInset(a: VisualViewportInset | null, b: VisualViewportInset | null) {
  return (
    a === b ||
    (!!a && !!b && a.inset === b.inset && a.height === b.height && a.offsetTop === b.offsetTop)
  );
}

/**
 * Tracks the on-screen keyboard through `visualViewport` while `enabled`. Returns `null` when no
 * keyboard is open (and always on the server or without `visualViewport`), so consumers apply
 * nothing in that case. Updates are `requestAnimationFrame`-throttled; listeners are removed on
 * cleanup.
 */
export function useVisualViewportInset(enabled = true): VisualViewportInset | null {
  const [state, setState] = useState<VisualViewportInset | null>(null);

  useEffect(() => {
    const viewport = typeof window === 'undefined' ? undefined : window.visualViewport;
    if (!enabled || !viewport) {
      setState(null);

      return;
    }

    let frame = 0;
    const update = () => {
      frame = 0;
      const next = readInset();
      setState((current) => (sameInset(current, next) ? current : next));
    };

    const schedule = () => {
      if (!frame) {
        frame = window.requestAnimationFrame(update);
      }
    };

    update();
    viewport.addEventListener('resize', schedule);
    viewport.addEventListener('scroll', schedule);

    return () => {
      viewport.removeEventListener('resize', schedule);
      viewport.removeEventListener('scroll', schedule);
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, [enabled]);

  return state;
}

export type KeyboardAvoidanceMode =
  /** Fixed surface centred with `top: 50%` + `translateY(-50%)`: re-centre within the visible area. */
  | 'center'
  /** Fixed surface glued to `bottom: 0`: lift it by the keyboard inset. */
  | 'bottom';

export interface KeyboardAvoidanceOptions {
  mode: KeyboardAvoidanceMode | null;
  /** CSS length the surface's own max-height is capped to when no keyboard is open (bottom mode). */
  maxHeightCap?: string;
  /** Pixels kept free around the surface inside the visible area. */
  margin?: number;
}

/**
 * Keeps a fixed overlay surface above the on-screen keyboard. Returns a ref (merged with the
 * forwarded one) and an inline `style` that is `undefined` whenever no keyboard is open, so the
 * surface keeps its normal CSS (and desktop is untouched). While the keyboard is open the surface
 * is capped to the visible area (its body scrolls instead of the action row disappearing) and the
 * focused field inside it is scrolled into view.
 */
export function useKeyboardAvoidance<T extends HTMLElement>(
  forwardedRef: ForwardedRef<T>,
  { mode, maxHeightCap, margin = 32 }: KeyboardAvoidanceOptions,
): { ref: (node: T | null) => void; style: CSSProperties | undefined } {
  const viewport = useVisualViewportInset(mode !== null);
  const nodeRef = useRef<T | null>(null);
  const ref = useCallback(
    (node: T | null) => {
      nodeRef.current = node;
      if (typeof forwardedRef === 'function') {
        forwardedRef(node);
      } else if (forwardedRef) {
        forwardedRef.current = node;
      }
    },
    [forwardedRef],
  );

  const lifted = viewport !== null;
  const inset = viewport?.inset;
  useEffect(() => {
    if (!lifted || typeof window === 'undefined') {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const active = document.activeElement;
      if (active instanceof HTMLElement && nodeRef.current?.contains(active)) {
        active.scrollIntoView?.({ block: 'nearest' });
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [lifted, inset]);

  if (!viewport || mode === null) {
    return { ref, style: undefined };
  }

  const available = Math.max(viewport.height - margin, 0);
  if (mode === 'center') {
    return {
      ref,
      style: {
        top: viewport.offsetTop + viewport.height / 2,
        maxHeight: available,
        overflowY: 'auto',
      },
    };
  }

  return {
    ref,
    style: {
      bottom: viewport.inset,
      maxHeight: maxHeightCap ? `min(${available}px, ${maxHeightCap})` : available,
      paddingBottom: 0,
    },
  };
}
