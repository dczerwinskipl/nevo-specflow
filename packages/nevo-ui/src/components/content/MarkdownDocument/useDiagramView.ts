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
 * Zoom and pan of one drawing in its viewport. The view is the opening one until the user zooms
 * or pans (so it follows a resize); Fit returns to it. Ctrl/Cmd + wheel and pinch zoom; a pointer
 * drag or two fingers pan. Inline, plain wheel and one-finger touch are left to the page; full
 * screen (`window`), where there is no page to scroll, one finger pans the drawing too.
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
    // A new width changes the inline viewport's own height: measuring in the observer callback
    // would resize the observed element within the same frame (a ResizeObserver loop), so the
    // measurement waits for the next frame.
    let frame: number | undefined;
    const observer = new ResizeObserver(() => {
      frame ??= requestAnimationFrame(() => {
        frame = undefined;
        measure();
      });
    });
    observer.observe(viewport);

    return () => {
      observer.disconnect();
      if (frame !== undefined) {
        cancelAnimationFrame(frame);
      }
    };
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

    // `targetTouches`: only fingers that started on the drawing count, so a finger resting on a
    // control does not turn a one-finger pan into a pinch.
    let pinch: { distance: number; middle: Point } | undefined;
    /** Full screen only: the last point of a one-finger pan. */
    let finger: Point | undefined;
    const oneFinger = (touches: TouchList) =>
      mode === 'window' && touches.length === 1
        ? local(touches[0]!.clientX, touches[0]!.clientY)
        : undefined;
    const twoFingers = (touches: TouchList) => {
      const [a, b] = [touches[0]!, touches[1]!];

      return {
        distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        middle: local((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2),
      };
    };

    const onTouchStart = (event: TouchEvent) => {
      pinch = event.targetTouches.length === 2 ? twoFingers(event.targetTouches) : undefined;
      finger = oneFinger(event.targetTouches);
    };

    const onTouchMove = (event: TouchEvent) => {
      const from = finger;
      if (from && event.targetTouches.length === 1) {
        event.preventDefault();
        const to = oneFinger(event.targetTouches)!;
        finger = to;
        update((current, g) => panBy(current, to.x - from.x, to.y - from.y, g));

        return;
      }

      if (event.targetTouches.length !== 2 || !pinch) {
        return;
      }

      event.preventDefault();
      const start = pinch;
      const now = twoFingers(event.targetTouches);
      pinch = now;
      // Zoom about where the fingers were, then follow them: the content under them stays put.
      update((current, g) =>
        panBy(
          zoomAt(current, now.distance / start.distance, start.middle, g),
          now.middle.x - start.middle.x,
          now.middle.y - start.middle.y,
          g,
        ),
      );
    };

    // Lifting one of two fingers continues as a one-finger pan from where that finger is.
    const onTouchEnd = (event: TouchEvent) => {
      pinch = event.targetTouches.length === 2 ? twoFingers(event.targetTouches) : undefined;
      finger = oneFinger(event.targetTouches);
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
  }, [viewport, update, mode]);

  // A mouse or pen drag pans; touch has its own listeners above.
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
    // An arrow that cannot move the view (the fitted drawing) keeps scrolling the page.
    if (
      next === undefined ||
      (event.key.startsWith('Arrow') && next !== 'reset' && sameView(next, view))
    ) {
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
    mode,
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
