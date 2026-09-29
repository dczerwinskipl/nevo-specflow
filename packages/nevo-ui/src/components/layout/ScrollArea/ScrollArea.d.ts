import { type HTMLAttributes, type ReactNode, type Ref, type UIEventHandler } from 'react';
import './ScrollArea.css';
export type ScrollAreaDirection = 'horizontal' | 'vertical' | 'both';
export type ScrollAreaEdge = 'left' | 'right' | 'top' | 'bottom';
export type ScrollAreaEdges = Readonly<Record<ScrollAreaEdge, boolean>>;
type EdgeVisibility = 'auto' | 'hidden';
export interface ScrollAreaProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'onScroll'> {
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
export declare function readScrollAreaEdges(viewport: Pick<HTMLElement, 'clientHeight' | 'clientWidth' | 'scrollHeight' | 'scrollTop' | 'scrollWidth'> & {
    getBoundingClientRect: () => DOMRect;
}, content: Pick<HTMLElement, 'getBoundingClientRect' | 'scrollWidth'>, direction: ScrollAreaDirection, epsilon?: number, rtl?: boolean): ScrollAreaEdges;
export declare const ScrollArea: import("react").ForwardRefExoticComponent<ScrollAreaProps & import("react").RefAttributes<HTMLDivElement>>;
export {};
//# sourceMappingURL=ScrollArea.d.ts.map