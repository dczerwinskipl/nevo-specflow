import type { NavigationNode } from '../NavigationCore';
export interface UnsupportedNavigationDepth {
    depth: number;
    key: string;
    path: readonly string[];
}
export declare function findUnsupportedNavigationDepth<TTarget>(nodes: readonly NavigationNode<TTarget>[], maximumDepth?: number): UnsupportedNavigationDepth[];
export declare function unsupportedNavigationDepthWarning(items: readonly UnsupportedNavigationDepth[]): string;
//# sourceMappingURL=diagnostics.d.ts.map