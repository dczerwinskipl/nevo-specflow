import { type ButtonHTMLAttributes, type HTMLAttributes } from 'react';
type ControlledTabsProps = {
    value: string;
    defaultValue?: never;
    onValueChange: (value: string) => void;
};
type UncontrolledTabsProps = {
    value?: never;
    defaultValue: string;
    onValueChange?: (value: string) => void;
};
export type TabsProps = Omit<HTMLAttributes<HTMLDivElement>, 'defaultValue'> & (ControlledTabsProps | UncontrolledTabsProps);
export type TabsListProps = Omit<HTMLAttributes<HTMLDivElement>, 'role'>;
export declare const TabsList: import("react").ForwardRefExoticComponent<TabsListProps & import("react").RefAttributes<HTMLDivElement>>;
export interface TabsTriggerProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'id' | 'value'> {
    value: string;
}
export declare const TabsTrigger: import("react").ForwardRefExoticComponent<TabsTriggerProps & import("react").RefAttributes<HTMLButtonElement>>;
export interface TabsContentProps extends Omit<HTMLAttributes<HTMLDivElement>, 'aria-labelledby' | 'hidden' | 'id' | 'role'> {
    value: string;
}
export declare const TabsContent: import("react").ForwardRefExoticComponent<TabsContentProps & import("react").RefAttributes<HTMLDivElement>>;
export declare const Tabs: import("react").ForwardRefExoticComponent<TabsProps & import("react").RefAttributes<HTMLDivElement>> & {
    List: import("react").ForwardRefExoticComponent<TabsListProps & import("react").RefAttributes<HTMLDivElement>>;
    Trigger: import("react").ForwardRefExoticComponent<TabsTriggerProps & import("react").RefAttributes<HTMLButtonElement>>;
    Content: import("react").ForwardRefExoticComponent<TabsContentProps & import("react").RefAttributes<HTMLDivElement>>;
};
export {};
//# sourceMappingURL=Tabs.d.ts.map