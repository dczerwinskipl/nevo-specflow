import { type HTMLAttributes, type ReactNode } from 'react';
import { type NavigationProviderProps } from '../NavigationCore';
import { type SideNavigationMessages, type SideNavigationRootIcons } from './SideNavigationItem';
/** Persisted Figma identity retained to update existing managed instances in place. */
export declare const sideNavigationFigmaIdentity: "TraditionalNavigationMenu";
type AccessibleNavigationName = {
    'aria-label': string;
    'aria-labelledby'?: string;
} | {
    'aria-label'?: never;
    'aria-labelledby': string;
};
type SideNavigationLabel = {
    label: ReactNode;
    'aria-label'?: string;
    'aria-labelledby'?: string;
} | ({
    label?: never;
} & AccessibleNavigationName);
export type SideNavigationProps<TTarget> = Omit<HTMLAttributes<HTMLElement>, 'aria-label' | 'aria-labelledby' | 'children'> & Omit<NavigationProviderProps<TTarget>, 'children'> & {
    rootIcons?: SideNavigationRootIcons;
    messages?: Partial<SideNavigationMessages>;
} & SideNavigationLabel;
export declare function SideNavigation<TTarget>({ adapter, className, defaultExpandedKeys, expandedKeys, label, messages: messagesProp, nodes, onExpandedKeysChange, rootIcons, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledBy, ...props }: SideNavigationProps<TTarget>): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=SideNavigation.d.ts.map