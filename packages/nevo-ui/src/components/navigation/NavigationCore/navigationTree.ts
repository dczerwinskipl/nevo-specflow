import type { NavigationAdapter, NavigationNode, NavigationTreeState } from './types';

export function createNavigationTreeState<TTarget>(
  nodes: readonly NavigationNode<TTarget>[],
  adapter: Pick<NavigationAdapter<TTarget>, 'match'>,
): NavigationTreeState<TTarget> {
  const nodesByKey = new Map<string, NavigationNode<TTarget>>();
  const parentByKey = new Map<string, string | null>();
  const pathByKey = new Map<string, readonly string[]>();
  const orderedExpandableKeys: string[] = [];
  const activeKeys = new Set<string>();
  const ancestorKeys = new Set<string>();

  const visit = (
    siblings: readonly NavigationNode<TTarget>[],
    parentKey: string | null,
    parentPath: readonly string[],
  ) => {
    for (const node of siblings) {
      const path = [...parentPath, node.key];
      const firstPath = pathByKey.get(node.key);
      if (firstPath) {
        throw new Error(
          `[NavigationProvider] Duplicate navigation key "${node.key}" at "${path.join(' > ')}"; first declared at "${firstPath.join(' > ')}".`,
        );
      }

      nodesByKey.set(node.key, node);
      parentByKey.set(node.key, parentKey);
      pathByKey.set(node.key, path);
      if (node.children?.length) orderedExpandableKeys.push(node.key);

      const match = adapter.match(node);
      if (match === 'active') activeKeys.add(node.key);
      if (match === 'ancestor') ancestorKeys.add(node.key);
      if (node.children?.length) visit(node.children, node.key, path);
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
  for (const activeKey of activeKeys) ancestorKeys.delete(activeKey);

  return { activeKeys, ancestorKeys, nodesByKey, orderedExpandableKeys, parentByKey };
}

export function normalizeExpandedKeys<TTarget>(
  tree: NavigationTreeState<TTarget>,
  keys: Iterable<string>,
): string[] {
  const requested = new Set(keys);
  return tree.orderedExpandableKeys.filter((key) => requested.has(key));
}

export function resolveInitialExpandedKeys<TTarget>(
  tree: NavigationTreeState<TTarget>,
  defaultExpandedKeys: Iterable<string> = [],
): string[] {
  return normalizeExpandedKeys(tree, [...defaultExpandedKeys, ...tree.ancestorKeys]);
}
