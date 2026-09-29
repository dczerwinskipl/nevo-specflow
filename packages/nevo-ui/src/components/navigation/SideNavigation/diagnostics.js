export function findUnsupportedNavigationDepth(nodes, maximumDepth = 2) {
    const unsupported = [];
    const visit = (siblings, depth, parentPath) => {
        for (const node of siblings) {
            const path = [...parentPath, node.key];
            if (depth > maximumDepth)
                unsupported.push({ depth, key: node.key, path });
            if (node.children?.length)
                visit(node.children, depth + 1, path);
        }
    };
    visit(nodes, 1, []);
    return unsupported;
}
export function unsupportedNavigationDepthWarning(items) {
    const details = items
        .map(({ depth, key, path }) => `- ${key} (depth ${depth}, path: ${path.join(' > ')})`)
        .join('\n');
    return `[SideNavigation] This renderer supports exactly two visible levels. The following nodes remain in Navigation Core state but are not rendered:\n${details}`;
}
//# sourceMappingURL=diagnostics.js.map