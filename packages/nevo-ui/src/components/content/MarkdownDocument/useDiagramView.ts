import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import {
  boxCentre,
  clampView,
  fitScale,
  fitView,
  panBy,
  scaleRange,
  viewForKey,
  zoomAt,
  zoomStep,
  type DiagramGeometry,
  type DiagramView,
  type Point,
  type Size,
} from './diagramView';

/** Space between the box edge and the drawing, in pixels. */
export const diagramInset = 12;

const sameView = (a: DiagramView, b: DiagramView) =>
  Math.abs(a.scale - b.scale) < 1e-4 && Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5;

/**
 * Zoom and pan of one drawing in its viewport. The view is the fitted one until the user zooms
 * or pans (so it follows a resize); reset returns to it. Plain wheel and one-finger touch are left
 * to the page; Ctrl/Cmd + wheel and pinch zoom; a pointer drag or two fingers pan.
 */
export function useDiagramView(content: Size, mode: 'inline' | 'window') {
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null);
  const [measured, setMeasured] = useState<Size>({ width: 0, height: 0 });
  /** The user's view; `null` while the diagram shows its fitted view. */
  const [userView, setUserView] = useState<DiagramView | null>(null);

  useLayoutEffect(() => {
    if (!viewport) {
      return undefined;
    }

    const measure = () =>
      setMeasured((current) => {
        const next = { width: viewport.clientWidth, height: viewport.clientHeight };

        return current.width === next.width && current.height === next.height ? current : next;
      });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);

    return () => observer.disconnect();
  }, [viewport]);

  const inner = {
    width: Math.max(0, measured.width - 2 * diagramInset),
    height: Math.max(0, measured.height - 2 * diagramInset),
  };
  const fit = fitScale(content, inner, mode);
  // Inline, the box is as tall as the fitted drawing; full screen, it is the window's.
  const geometry: DiagramGeometry = {
    content,
    box: mode === 'inline' ? { width: inner.width, height: content.height * fit } : inner,
    fit,
  };
  const opening = fitView(geometry);
  const view = userView ? clampView(userView, geometry) : opening;
  const range = scaleRange(fit);

  // The gesture listeners read the latest geometry; it is refreshed after every render.
  const geometryRef = useRef(geometry);
  useLayoutEffect(() => {
    geometryRef.current = geometry;
  });

  const update = useCallback((next: (current: DiagramView, g: DiagramGeometry) => DiagramView) => {
    setUserView((previous) => {
      const g = geometryRef.current;
      const result = next(previous ? clampView(previous, g) : fitView(g), g);

      // Back at the fitted view: follow the box again.
      return sameView(result, fitView(g)) ? null : result;
    });
  }, []);

  const reset = useCallback(() => setUserView(null), []);
  const zoomIn = useCallback(
    () => update((current, g) => zoomAt(current, zoomStep, boxCentre(g), g)),
    [update],
  );
  const zoomOut = useCallback(
    () => update((current, g) => zoomAt(current, 1 / zoomStep, boxCentre(g), g)),
    [update],
  );

  // Ctrl/Cmd + wheel and two-finger touch need non-passive listeners to keep the page still.
  useLayoutEffect(() => {
    if (!viewport) {
      return undefined;
    }

    const local = (clientX: number, clientY: number): Point => {
      const rect = viewport.getBoundingClientRect();

      return { x: clientX - rect.left - diagramInset, y: clientY - rect.top - diagramInset };
    };

    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) {
        return;
      }

      event.preventDefault();
      const point = local(event.clientX, event.clientY);
      update((current, g) => zoomAt(current, Math.exp(-event.deltaY * 0.0015), point, g));
    };

    let pinch: { distance: number; middle: Point } | undefined;
    const twoFingers = (touches: TouchList) => {
      const [a, b] = [touches[0]!, touches[1]!];

      return {
        distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        middle: local((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2),
      };
    };

    const onTouchStart = (event: TouchEvent) => {
      pinch = event.touches.length === 2 ? twoFingers(event.touches) : undefined;
    };

    const onTouchMove = (event: TouchEvent) => {
      if (event.touches.length !== 2 || !pinch) {
        return;
      }

      event.preventDefault();
      const start = pinch;
      const now = twoFingers(event.touches);
      pinch = now;
      update((current, g) =>
        panBy(
          zoomAt(current, now.distance / start.distance, now.middle, g),
          now.middle.x - start.middle.x,
          now.middle.y - start.middle.y,
          g,
        ),
      );
    };

    const onTouchEnd = (event: TouchEvent) => {
      pinch = event.touches.length === 2 ? twoFingers(event.touches) : undefined;
    };

    viewport.addEventListener('wheel', onWheel, { passive: false });
    viewport.addEventListener('touchstart', onTouchStart, { passive: true });
    viewport.addEventListener('touchmove', onTouchMove, { passive: false });
    viewport.addEventListener('touchend', onTouchEnd);
    viewport.addEventListener('touchcancel', onTouchEnd);

    return () => {
      viewport.removeEventListener('wheel', onWheel);
      viewport.removeEventListener('touchstart', onTouchStart);
      viewport.removeEventListener('touchmove', onTouchMove);
      viewport.removeEventListener('touchend', onTouchEnd);
      viewport.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [viewport, update]);

  // A mouse or pen drag pans; touch is left to the page (one finger) and the pinch (two).
  const drag = useRef<{ id: number; x: number; y: number } | undefined>(undefined);
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch' || event.button !== 0) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (start?.id !== event.pointerId) {
      return;
    }

    drag.current = { id: start.id, x: event.clientX, y: event.clientY };
    update((current, g) => panBy(current, event.clientX - start.x, event.clientY - start.y, g));
  };

  const onPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id === event.pointerId) {
      drag.current = undefined;
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }

    const next = viewForKey(event.key, view, geometry);
    if (next === undefined) {
      return;
    }

    event.preventDefault();
    if (next === 'reset') {
      reset();
    } else {
      update(() => next);
    }
  };

  return {
    view,
    /** The box height inline (the fitted drawing plus the inset); full screen it fills. */
    height: mode === 'inline' ? geometry.box.height + 2 * diagramInset : undefined,
    pannable:
      content.width * view.scale > geometry.box.width + 0.5 ||
      content.height * view.scale > geometry.box.height + 0.5,
    fitted: userView === null,
    canZoomIn: view.scale < range.max - 1e-4,
    canZoomOut: view.scale > range.min + 1e-4,
    zoomIn,
    zoomOut,
    reset,
    viewportRef: setViewport,
    viewportProps: {
      onKeyDown,
      onPointerDown,
      onPointerMove,
      onPointerUp: onPointerEnd,
      onPointerCancel: onPointerEnd,
    },
  };
}
