import type { NavigationAdapter, NavigationNode, NavigationTreeState } from './types';
export declare function createNavigationTreeState<TTarget>(nodes: readonly NavigationNode<TTarget>[], adapter: Pick<NavigationAdapter<TTarget>, 'match'>): NavigationTreeState<TTarget>;
export declare function normalizeExpandedKeys<TTarget>(tree: NavigationTreeState<TTarget>, keys: Iterable<string>): string[];
export declare function resolveInitialExpandedKeys<TTarget>(tree: NavigationTreeState<TTarget>, defaultExpandedKeys?: Iterable<string>): string[];
//# sourceMappingURL=navigationTree.d.ts.map