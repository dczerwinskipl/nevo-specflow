export function createNavigationTreeState(nodes, adapter) {
    const nodesByKey = new Map();
    const parentByKey = new Map();
    const pathByKey = new Map();
    const orderedExpandableKeys = [];
    const activeKeys = new Set();
    const ancestorKeys = new Set();
    const visit = (siblings, parentKey, parentPath) => {
        for (const node of siblings) {
            const path = [...parentPath, node.key];
            const firstPath = pathByKey.get(node.key);
            if (firstPath) {
                throw new Error(`[NavigationProvider] Duplicate navigation key "${node.key}" at "${path.join(' > ')}"; first declared at "${firstPath.join(' > ')}".`);
            }
            nodesByKey.set(node.key, node);
            parentByKey.set(node.key, parentKey);
            pathByKey.set(node.key, path);
            if (node.children?.length)
                orderedExpandableKeys.push(node.key);
            const match = adapter.match(node);
            if (match === 'active')
                activeKeys.add(node.key);
            if (match === 'ancestor')
                ancestorKeys.add(node.key);
            if (node.children?.length)
                visit(node.children, node.key, path);
        }
    };
    visit(nodes, null, []);
    for (const activeKey of activeKeys) {
        let parentKey = parentByKey.get(activeKey) ?? null;
        while (parentKey) {
            ancestorKeys.add(parentKey);
            parentKey = parentByKey.get(parentKey) ?? null;
        }
    }
    for (const activeKey of activeKeys)
        ancestorKeys.delete(activeKey);
    return { activeKeys, ancestorKeys, nodesByKey, orderedExpandableKeys, parentByKey };
}
export function normalizeExpandedKeys(tree, keys) {
    const requested = new Set(keys);
    return tree.orderedExpandableKeys.filter((key) => requested.has(key));
}
export function resolveInitialExpandedKeys(tree, defaultExpandedKeys = []) {
    return normalizeExpandedKeys(tree, [...defaultExpandedKeys, ...tree.ancestorKeys]);
}
//# sourceMappingURL=navigationTree.js.map