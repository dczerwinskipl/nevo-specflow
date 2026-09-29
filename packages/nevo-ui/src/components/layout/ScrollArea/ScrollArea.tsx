import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
  type Ref,
  type UIEventHandler,
} from 'react';

import { cn } from '../../../lib';
import './ScrollArea.css';

export type ScrollAreaDirection = 'horizontal' | 'vertical' | 'both';
export type ScrollAreaEdge = 'left' | 'right' | 'top' | 'bottom';
export type ScrollAreaEdges = Readonly<Record<ScrollAreaEdge, boolean>>;

type EdgeVisibility = 'auto' | 'hidden';

export interface ScrollAreaProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  'children' | 'onScroll'
> {
  children: ReactNode;
  contentClassName?: string;
  direction?: ScrollAreaDirection;
  endEdge?: EdgeVisibility;
  indicatorColor?: string;
  onEdgesChange?: (edges: ScrollAreaEdges) => void;
  onScroll?: UIEventHandler<HTMLDivElement>;
  startEdge?: EdgeVisibility;
  viewportClassName?: string;
  viewportRef?: Ref<HTMLDivElement>;
}

const hiddenEdges: ScrollAreaEdges = {
  left: false,
  right: false,
  top: false,
  bottom: false,
};

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === 'function') ref(value);
  else if (ref) ref.current = value;
}

export function readScrollAreaEdges(
  viewport: Pick<
    HTMLElement,
    'clientHeight' | 'clientWidth' | 'scrollHeight' | 'scrollTop' | 'scrollWidth'
  > & {
    getBoundingClientRect: () => DOMRect;
  },
  content: Pick<HTMLElement, 'getBoundingClientRect' | 'scrollWidth'>,
  direction: ScrollAreaDirection,
  epsilon = 0.5,
  rtl = false,
): ScrollAreaEdges {
  const horizontal = direction === 'horizontal' || direction === 'both';
  const vertical = direction === 'vertical' || direction === 'both';
  const viewportRect = viewport.getBoundingClientRect();
  const contentRect = content.getBoundingClientRect();
  const contentWidth = Math.max(contentRect.width, content.scrollWidth);
  const contentLeft = rtl ? contentRect.right - contentWidth : contentRect.left;
  const contentRight = rtl ? contentRect.right : contentRect.left + contentWidth;
  const horizontalOverflow = horizontal && viewport.scrollWidth > viewport.clientWidth + epsilon;
  const verticalOverflow = vertical && viewport.scrollHeight > viewport.clientHeight + epsilon;

  return {
    left: horizontalOverflow && contentLeft < viewportRect.left - epsilon,
    right: horizontalOverflow && contentRight > viewportRect.right + epsilon,
    top: verticalOverflow && viewport.scrollTop > epsilon,
    bottom:
      verticalOverflow &&
      viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop > epsilon,
  };
}

function sameEdges(first: ScrollAreaEdges, second: ScrollAreaEdges) {
  return (
    first.left === second.left &&
    first.right === second.right &&
    first.top === second.top &&
    first.bottom === second.bottom
  );
}

export const ScrollArea = forwardRef<HTMLDivElement, ScrollAreaProps>(function ScrollArea(
  {
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledBy,
    children,
    className,
    contentClassName,
    direction = 'vertical',
    endEdge = 'auto',
    indicatorColor,
    onEdgesChange,
    onScroll,
    startEdge = 'auto',
    style,
    tabIndex = 0,
    viewportClassName,
    viewportRef,
    ...props
  },
  forwardedRef,
) {
  const rootRef = useRef<HTMLDivElement>(null);
  const internalViewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const edgesRef = useRef<ScrollAreaEdges>(hiddenEdges);
  const frameRef = useRef<number | null>(null);

  const update = useCallback(() => {
    frameRef.current = null;
    const root = rootRef.current;
    const viewport = internalViewportRef.current;
    const content = contentRef.current;
    if (!root || !viewport || !content) return;

    const measured = readScrollAreaEdges(
      viewport,
      content,
      direction,
      0.5,
      getComputedStyle(viewport).direction === 'rtl',
    );
    const edges: ScrollAreaEdges = {
      left: startEdge === 'auto' ? measured.left : false,
      right: endEdge === 'auto' ? measured.right : false,
      top: startEdge === 'auto' ? measured.top : false,
      bottom: endEdge === 'auto' ? measured.bottom : false,
    };

    root.dataset.edgeLeft = String(edges.left);
    root.dataset.edgeRight = String(edges.right);
    root.dataset.edgeTop = String(edges.top);
    root.dataset.edgeBottom = String(edges.bottom);

    if (!sameEdges(edgesRef.current, edges)) {
      edgesRef.current = edges;
      onEdgesChange?.(edges);
    }
  }, [direction, endEdge, onEdgesChange, startEdge]);

  const scheduleUpdate = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(update);
  }, [update]);

  useEffect(() => {
    const viewport = internalViewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;

    const resizeObserver = new ResizeObserver(scheduleUpdate);
    resizeObserver.observe(viewport);
    resizeObserver.observe(content);

    const mutationObserver = new MutationObserver(scheduleUpdate);
    mutationObserver.observe(content, {
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true,
    });

    scheduleUpdate();

    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [scheduleUpdate]);

  const setRootRef = useCallback(
    (node: HTMLDivElement | null) => {
      rootRef.current = node;
      assignRef(forwardedRef, node);
    },
    [forwardedRef],
  );
  const setViewportRef = useCallback(
    (node: HTMLDivElement | null) => {
      internalViewportRef.current = node;
      assignRef(viewportRef, node);
    },
    [viewportRef],
  );

  const overflowClassName =
    direction === 'horizontal'
      ? 'overflow-x-auto overflow-y-hidden'
      : direction === 'vertical'
        ? 'overflow-x-hidden overflow-y-auto'
        : 'overflow-auto';
  const indicatorStyle = {
    ...style,
    ...(indicatorColor ? { '--scroll-edge-indicator': indicatorColor } : {}),
  } as CSSProperties;

  return (
    <div
      ref={setRootRef}
      className={cn('scroll-area', className)}
      data-direction={direction}
      data-edge-bottom="false"
      data-edge-left="false"
      data-edge-right="false"
      data-edge-top="false"
      style={indicatorStyle}
      {...props}
    >
      <div
        ref={setViewportRef}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        className={cn(
          'scroll-area-viewport h-full w-full min-h-0 min-w-0',
          overflowClassName,
          viewportClassName,
        )}
        onScroll={(event) => {
          scheduleUpdate();
          onScroll?.(event);
        }}
        role={ariaLabel || ariaLabelledBy ? 'region' : undefined}
        tabIndex={tabIndex}
      >
        <div ref={contentRef} className={cn('scroll-area-content', contentClassName)}>
          {children}
        </div>
      </div>
      <div aria-hidden="true" className="scroll-area-indicator scroll-area-indicator-left" />
      <div aria-hidden="true" className="scroll-area-indicator scroll-area-indicator-right" />
      <div aria-hidden="true" className="scroll-area-indicator scroll-area-indicator-top" />
      <div aria-hidden="true" className="scroll-area-indicator scroll-area-indicator-bottom" />
    </div>
  );
});

