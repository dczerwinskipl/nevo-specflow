import type { NavigationNode } from '../NavigationCore';

export interface UnsupportedNavigationDepth {
  depth: number;
  key: string;
  path: readonly string[];
}

export function findUnsupportedNavigationDepth<TTarget>(
  nodes: readonly NavigationNode<TTarget>[],
  maximumDepth = 2,
): UnsupportedNavigationDepth[] {
  const unsupported: UnsupportedNavigationDepth[] = [];
  const visit = (
    siblings: readonly NavigationNode<TTarget>[],
    depth: number,
    parentPath: readonly string[],
  ) => {
    for (const node of siblings) {
      const path = [...parentPath, node.key];
      if (depth > maximumDepth) unsupported.push({ depth, key: node.key, path });
      if (node.children?.length) visit(node.children, depth + 1, path);
    }
  };
  visit(nodes, 1, []);
  return unsupported;
}

export function unsupportedNavigationDepthWarning(items: readonly UnsupportedNavigationDepth[]) {
  const details = items
    .map(({ depth, key, path }) => `- ${key} (depth ${depth}, path: ${path.join(' > ')})`)
    .join('\n');
  return `[SideNavigation] This renderer supports exactly two visible levels. The following nodes remain in Navigation Core state but are not rendered:\n${details}`;
}

