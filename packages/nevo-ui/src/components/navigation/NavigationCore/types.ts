import type { ReactNode } from 'react';

export type NavigationMatch = 'none' | 'ancestor' | 'active';

export interface NavigationNode<TTarget = unknown> {
  key: string;
  label: string;
  target?: TTarget;
  children?: readonly NavigationNode<TTarget>[];
}

export interface NavigationLinkRenderArgs<TTarget> {
  node: NavigationNode<TTarget>;
  children: ReactNode;
  className: string;
  isActive: boolean;
}

export interface NavigationAdapter<TTarget = unknown> {
  match: (node: NavigationNode<TTarget>) => NavigationMatch;
  renderLink: (args: NavigationLinkRenderArgs<TTarget>) => ReactNode;
}

export interface NavigationTreeState<TTarget = unknown> {
  activeKeys: ReadonlySet<string>;
  ancestorKeys: ReadonlySet<string>;
  nodesByKey: ReadonlyMap<string, NavigationNode<TTarget>>;
  orderedExpandableKeys: readonly string[];
  parentByKey: ReadonlyMap<string, string | null>;
}

interface ControlledNavigationProviderProps {
  expandedKeys: readonly string[];
  defaultExpandedKeys?: never;
  onExpandedKeysChange: (keys: readonly string[]) => void;
}

interface UncontrolledNavigationProviderProps {
  expandedKeys?: never;
  defaultExpandedKeys?: readonly string[];
  onExpandedKeysChange?: (keys: readonly string[]) => void;
}

export type NavigationProviderProps<TTarget> = {
  adapter: NavigationAdapter<TTarget>;
  children: ReactNode;
  nodes: readonly NavigationNode<TTarget>[];
} & (ControlledNavigationProviderProps | UncontrolledNavigationProviderProps);

export interface NavigationNodeHandle<TTarget = unknown> {
  adapter: NavigationAdapter<TTarget>;
  isActive: boolean;
  isAncestorOfActive: boolean;
  isExpanded: boolean;
  node: NavigationNode<TTarget>;
  setExpanded: (expanded: boolean) => void;
  toggleExpanded: () => void;
}
