import { useCallback, useEffect, useMemo, useState } from 'react';
import { normalizeExpandedKeys, resolveInitialExpandedKeys } from './navigationTree';
export function useNavigationExpansion({ controlledExpandedKeys, defaultExpandedKeys, onExpandedKeysChange, tree, }) {
    const controlled = controlledExpandedKeys !== undefined;
    const [uncontrolledExpandedKeys, setUncontrolledExpandedKeys] = useState(() => resolveInitialExpandedKeys(tree, defaultExpandedKeys));
    const activeAncestorSignature = [...tree.ancestorKeys].join('\u0000');
    useEffect(() => {
        if (controlled)
            return;
        setUncontrolledExpandedKeys((current) => {
            const next = resolveInitialExpandedKeys(tree, current);
            return next.length === current.length && next.every((key, index) => key === current[index])
                ? current
                : next;
        });
    }, [activeAncestorSignature, controlled, tree]);
    const normalizedExpandedKeys = normalizeExpandedKeys(tree, controlled ? controlledExpandedKeys : uncontrolledExpandedKeys);
    const normalizedExpandedSignature = normalizedExpandedKeys.join('\u0000');
    const expandedKeys = useMemo(() => new Set(normalizedExpandedKeys), [normalizedExpandedSignature]);
    const setExpanded = useCallback((key, expanded) => {
        if (!tree.orderedExpandableKeys.includes(key))
            return;
        const current = new Set(normalizedExpandedKeys);
        if (expanded)
            current.add(key);
        else
            current.delete(key);
        const next = normalizeExpandedKeys(tree, current);
        if (next.length === normalizedExpandedKeys.length &&
            next.every((value, index) => value === normalizedExpandedKeys[index]))
            return;
        if (!controlled)
            setUncontrolledExpandedKeys(next);
        onExpandedKeysChange?.(next);
    }, [controlled, normalizedExpandedKeys, onExpandedKeysChange, tree]);
    return { expandedKeys, setExpanded };
}
//# sourceMappingURL=useNavigationExpansion.js.map