import { useContext } from 'react';
import { NavigationContext } from './NavigationContext';
export function useNavigationNode(key) {
    const context = useContext(NavigationContext);
    if (!context)
        throw new Error('useNavigationNode must be used inside NavigationProvider.');
    const node = context.tree.nodesByKey.get(key);
    if (!node)
        throw new Error(`Unknown navigation key "${key}".`);
    const isExpanded = context.expandedKeys.has(key);
    return {
        adapter: context.adapter,
        isActive: context.tree.activeKeys.has(key),
        isAncestorOfActive: context.tree.ancestorKeys.has(key),
        isExpanded,
        node: node,
        setExpanded: (expanded) => context.setExpanded(key, expanded),
        toggleExpanded: () => context.setExpanded(key, !isExpanded),
    };
}
//# sourceMappingURL=useNavigationNode.js.map