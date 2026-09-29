import { Button as AriaButton, Disclosure as AriaDisclosure, DisclosurePanel as AriaDisclosurePanel } from 'react-aria-components';
import { type ComponentPropsWithoutRef } from 'react';
export type CollapsibleProps = Omit<ComponentPropsWithoutRef<typeof AriaDisclosure>, 'className'> & {
    className?: string;
    showIndicator?: boolean;
};
export type CollapsibleTriggerProps = Omit<ComponentPropsWithoutRef<typeof AriaButton>, 'className' | 'slot'> & {
    className?: string;
};
export declare const CollapsibleTrigger: import("react").ForwardRefExoticComponent<Omit<Omit<import("react-aria-components").ButtonProps & import("react").RefAttributes<HTMLButtonElement>, "ref">, "slot" | "className"> & {
    className?: string;
} & import("react").RefAttributes<HTMLButtonElement>>;
export type CollapsibleContentProps = Omit<ComponentPropsWithoutRef<typeof AriaDisclosurePanel>, 'className'> & {
    className?: string;
};
export declare const CollapsibleContent: import("react").ForwardRefExoticComponent<Omit<Omit<import("react-aria-components").DisclosurePanelProps & import("react").RefAttributes<HTMLDivElement>, "ref">, "className"> & {
    className?: string;
} & import("react").RefAttributes<HTMLDivElement>>;
export declare const Collapsible: import("react").ForwardRefExoticComponent<Omit<Omit<import("react-aria-components").DisclosureProps & import("react").RefAttributes<HTMLDivElement>, "ref">, "className"> & {
    className?: string;
    showIndicator?: boolean;
} & import("react").RefAttributes<HTMLDivElement>> & {
    Trigger: import("react").ForwardRefExoticComponent<Omit<Omit<import("react-aria-components").ButtonProps & import("react").RefAttributes<HTMLButtonElement>, "ref">, "slot" | "className"> & {
        className?: string;
    } & import("react").RefAttributes<HTMLButtonElement>>;
    Content: import("react").ForwardRefExoticComponent<Omit<Omit<import("react-aria-components").DisclosurePanelProps & import("react").RefAttributes<HTMLDivElement>, "ref">, "className"> & {
        className?: string;
    } & import("react").RefAttributes<HTMLDivElement>>;
};
//# sourceMappingURL=Collapsible.d.ts.map