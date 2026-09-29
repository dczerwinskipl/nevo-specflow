import type { NavigationTreeState } from './types';
export declare function useNavigationExpansion<TTarget>({ controlledExpandedKeys, defaultExpandedKeys, onExpandedKeysChange, tree, }: {
    controlledExpandedKeys?: readonly string[];
    defaultExpandedKeys?: readonly string[];
    onExpandedKeysChange?: (keys: readonly string[]) => void;
    tree: NavigationTreeState<TTarget>;
}): {
    expandedKeys: Set<string>;
    setExpanded: (key: string, expanded: boolean) => void;
};
//# sourceMappingURL=useNavigationExpansion.d.ts.map