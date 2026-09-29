import { type IconName } from '../../foundations/Icon';
export type SideNavigationRootIcons = Readonly<Record<string, IconName | undefined>>;
export interface SideNavigationMessages {
    collapse: (label: string) => string;
    expand: (label: string) => string;
}
export declare function SideNavigationItem<TTarget>({ depth, nodeKey, rootIcons, messages, }: {
    depth: 1 | 2;
    nodeKey: string;
    rootIcons?: SideNavigationRootIcons;
    messages: Readonly<SideNavigationMessages>;
}): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=SideNavigationItem.d.ts.map