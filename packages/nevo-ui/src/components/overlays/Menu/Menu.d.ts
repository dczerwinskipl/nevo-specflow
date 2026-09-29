import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { type VariantProps } from 'tailwind-variants/lite';
import { type IconName } from '../../foundations/Icon';
import './Menu.css';
export declare const Menu: import("react").FC<DropdownMenu.DropdownMenuProps>;
export declare const MenuTrigger: import("react").ForwardRefExoticComponent<DropdownMenu.DropdownMenuTriggerProps & import("react").RefAttributes<HTMLButtonElement>>;
export declare const MenuGroup: import("react").ForwardRefExoticComponent<DropdownMenu.DropdownMenuGroupProps & import("react").RefAttributes<HTMLDivElement>>;
export type MenuContentProps = ComponentPropsWithoutRef<typeof DropdownMenu.Content> & {
    container?: HTMLElement | null;
};
export declare const MenuContent: import("react").ForwardRefExoticComponent<Omit<DropdownMenu.DropdownMenuContentProps & import("react").RefAttributes<HTMLDivElement>, "ref"> & {
    container?: HTMLElement | null;
} & import("react").RefAttributes<HTMLDivElement>>;
export declare const menuItemDefaults: {
    readonly state: "default";
    readonly tone: "neutral";
};
export declare const menuItemVariants: import("tailwind-variants/lite").TVReturnType<{
    tone: {
        neutral: "";
        danger: "text-action-danger data-[tone=danger]:text-action-danger data-[tone=danger]:data-[highlighted]:bg-action-danger-subtle data-[tone=danger]:data-[highlighted]:text-action-danger data-[tone=danger]:data-[design-prop-state=highlighted]:bg-action-danger-subtle data-[tone=danger]:data-[design-prop-state=highlighted]:text-action-danger data-[tone=danger]:data-[disabled]:text-content-muted";
    };
}, undefined, undefined, {
    state: {
        default: "";
        highlighted: "bg-surface-hover text-content-primary";
        disabled: "pointer-events-none text-content-muted opacity-50";
    };
}, undefined, import("tailwind-variants/lite").TVReturnType<{
    state: {
        default: "";
        highlighted: "bg-surface-hover text-content-primary";
        disabled: "pointer-events-none text-content-muted opacity-50";
    };
}, undefined, "relative flex min-h-control-height-compact w-full select-none items-center gap-2 rounded-control px-control-padding-compact py-1.5 text-left text-body-sm text-content-secondary outline-none data-[highlighted]:bg-surface-hover data-[highlighted]:text-content-primary data-[design-prop-state=highlighted]:bg-surface-hover data-[design-prop-state=highlighted]:text-content-primary data-[disabled]:pointer-events-none data-[disabled]:text-content-muted data-[disabled]:opacity-50 transition-colors [transition-duration:var(--motion-duration-fast)] [transition-timing-function:var(--motion-ease-standard)] motion-reduce:transition-none", {
    state: {
        default: "";
        highlighted: "bg-surface-hover text-content-primary";
        disabled: "pointer-events-none text-content-muted opacity-50";
    };
}, undefined, import("tailwind-variants/lite").TVReturnTypeLike<{
    state: {
        default: "";
        highlighted: "bg-surface-hover text-content-primary";
        disabled: "pointer-events-none text-content-muted opacity-50";
    };
}, undefined>>>;
export type MenuItemTone = NonNullable<VariantProps<typeof menuItemVariants>['tone']>;
export interface MenuItemProps extends Omit<ComponentPropsWithoutRef<typeof DropdownMenu.Item>, 'children'>, Pick<VariantProps<typeof menuItemVariants>, 'tone'> {
    children: ReactNode;
    leadingIcon?: IconName;
    shortcut?: ReactNode;
}
export declare const MenuItem: import("react").ForwardRefExoticComponent<MenuItemProps & import("react").RefAttributes<HTMLDivElement>>;
export declare const MenuLabel: import("react").ForwardRefExoticComponent<Omit<DropdownMenu.DropdownMenuLabelProps & import("react").RefAttributes<HTMLDivElement>, "ref"> & import("react").RefAttributes<HTMLDivElement>>;
export declare const MenuSeparator: import("react").ForwardRefExoticComponent<Omit<DropdownMenu.DropdownMenuSeparatorProps & import("react").RefAttributes<HTMLDivElement>, "ref"> & import("react").RefAttributes<HTMLDivElement>>;
//# sourceMappingURL=Menu.d.ts.map