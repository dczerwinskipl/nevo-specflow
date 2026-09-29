import { useMemo } from 'react';
import { NavigationContext, type NavigationContextValue } from './NavigationContext';
import { createNavigationTreeState } from './navigationTree';
import { useNavigationExpansion } from './useNavigationExpansion';
import type { NavigationAdapter, NavigationProviderProps, NavigationTreeState } from './types';

export function NavigationProvider<TTarget>({
  adapter,
  children,
  defaultExpandedKeys,
  expandedKeys: controlledExpandedKeys,
  nodes,
  onExpandedKeysChange,
}: NavigationProviderProps<TTarget>) {
  const tree = useMemo(() => createNavigationTreeState(nodes, adapter), [adapter, nodes]);
  const { expandedKeys, setExpanded } = useNavigationExpansion({
    controlledExpandedKeys,
    defaultExpandedKeys,
    onExpandedKeysChange,
    tree,
  });

  const value = useMemo<NavigationContextValue>(
    () => ({
      adapter: adapter as NavigationAdapter<unknown>,
      expandedKeys,
      setExpanded,
      tree: tree as NavigationTreeState<unknown>,
    }),
    [adapter, expandedKeys, setExpanded, tree],
  );

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

