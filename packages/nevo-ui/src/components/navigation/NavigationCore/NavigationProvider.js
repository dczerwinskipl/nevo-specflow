import { jsx as _jsx } from "react/jsx-runtime";
import { useMemo } from 'react';
import { NavigationContext } from './NavigationContext';
import { createNavigationTreeState } from './navigationTree';
import { useNavigationExpansion } from './useNavigationExpansion';
export function NavigationProvider({ adapter, children, defaultExpandedKeys, expandedKeys: controlledExpandedKeys, nodes, onExpandedKeysChange, }) {
    const tree = useMemo(() => createNavigationTreeState(nodes, adapter), [adapter, nodes]);
    const { expandedKeys, setExpanded } = useNavigationExpansion({
        controlledExpandedKeys,
        defaultExpandedKeys,
        onExpandedKeysChange,
        tree,
    });
    const value = useMemo(() => ({
        adapter: adapter,
        expandedKeys,
        setExpanded,
        tree: tree,
    }), [adapter, expandedKeys, setExpanded, tree]);
    return _jsx(NavigationContext.Provider, { value: value, children: children });
}
//# sourceMappingURL=NavigationProvider.js.map