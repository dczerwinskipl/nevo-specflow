import { createContext } from 'react';
import type { NavigationAdapter, NavigationTreeState } from './types';

export interface NavigationContextValue {
  adapter: NavigationAdapter<unknown>;
  expandedKeys: ReadonlySet<string>;
  setExpanded: (key: string, expanded: boolean) => void;
  tree: NavigationTreeState<unknown>;
}

export const NavigationContext = createContext<NavigationContextValue | null>(null);
