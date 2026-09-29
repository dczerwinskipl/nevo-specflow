import type { NavigationAdapter, NavigationTreeState } from './types';
export interface NavigationContextValue {
    adapter: NavigationAdapter<unknown>;
    expandedKeys: ReadonlySet<string>;
    setExpanded: (key: string, expanded: boolean) => void;
    tree: NavigationTreeState<unknown>;
}
export declare const NavigationContext: import("react").Context<NavigationContextValue | null>;
//# sourceMappingURL=NavigationContext.d.ts.map