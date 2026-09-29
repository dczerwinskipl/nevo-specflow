import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { forwardRef, } from 'react';
import { tv } from 'tailwind-variants/lite';
import { designSlot, useDesignMetadata } from '@nevo/figma-core/metadata';
import { floatingContentClassName, floatingItemVariants, floatingLabelClassName, floatingSeparatorClassName, } from '../../../design-system/floatingRecipes';
import { cn } from '../../../lib';
import { Icon } from '../../foundations/Icon';
import { Typography } from '../../foundations/Typography';
import './Menu.css';
export const Menu = DropdownMenu.Root;
export const MenuTrigger = DropdownMenu.Trigger;
export const MenuGroup = DropdownMenu.Group;
export const MenuContent = forwardRef(function MenuContent({ align = 'start', children, className, container, sideOffset = 8, ...props }, ref) {
    const capture = useDesignMetadata('Menu');
    return (_jsx(DropdownMenu.Portal, { container: container, children: _jsx(DropdownMenu.Content, { ref: ref, align: align, className: cn('menu-content', floatingContentClassName, 'w-56', className), sideOffset: sideOffset, ...props, ...capture, children: _jsx("div", { ...designSlot('Menu', 'items'), children: children }) }) }));
});
export const menuItemDefaults = { state: 'default', tone: 'neutral' };
export const menuItemVariants = tv({
    extend: floatingItemVariants,
    variants: {
        tone: {
            neutral: '',
            danger: 'text-action-danger data-[tone=danger]:text-action-danger data-[tone=danger]:data-[highlighted]:bg-action-danger-subtle data-[tone=danger]:data-[highlighted]:text-action-danger data-[tone=danger]:data-[design-prop-state=highlighted]:bg-action-danger-subtle data-[tone=danger]:data-[design-prop-state=highlighted]:text-action-danger data-[tone=danger]:data-[disabled]:text-content-muted',
        },
    },
    compoundVariants: [
        {
            state: 'highlighted',
            tone: 'danger',
            class: 'bg-action-danger-subtle text-action-danger',
        },
    ],
    defaultVariants: menuItemDefaults,
});
export const MenuItem = forwardRef(function MenuItem({ autoFocus, children, className, disabled, leadingIcon, shortcut, tone = menuItemDefaults.tone, ...props }, ref) {
    const capture = useDesignMetadata('MenuItem', {
        state: disabled ? 'disabled' : autoFocus ? 'highlighted' : 'default',
        tone,
    });
    return (_jsxs(DropdownMenu.Item, { ref: ref, autoFocus: autoFocus, className: cn(menuItemVariants({ tone }), className), "data-design-token-background": autoFocus
            ? tone === 'danger'
                ? 'Color/action-danger-subtle'
                : 'Color/surface-hover'
            : undefined, "data-tone": tone, disabled: disabled, ...props, ...capture, children: [leadingIcon ? (_jsx("span", { className: "inline-flex shrink-0", ...designSlot('MenuItem', 'leadingIcon'), children: _jsx(Icon, { name: leadingIcon, size: "sm" }) })) : null, _jsx(Typography, { className: "min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-current", ...designSlot('MenuItem', 'label'), variant: "body-sm", children: children }), shortcut ? (_jsx(Typography, { as: "span", className: "ml-auto shrink-0 pl-4 text-content-muted", ...designSlot('MenuItem', 'shortcut'), variant: "code-md", children: shortcut })) : null] }));
});
export const MenuLabel = forwardRef(function MenuLabel({ children, className, ...props }, ref) {
    return (_jsx(DropdownMenu.Label, { ref: ref, className: cn(floatingLabelClassName, className), ...props, children: _jsx(Typography, { as: "span", className: "text-inherit", variant: "section-label", children: children }) }));
});
export const MenuSeparator = forwardRef(function MenuSeparator({ className, ...props }, ref) {
    return (_jsx(DropdownMenu.Separator, { ref: ref, className: cn(floatingSeparatorClassName, className), ...props }));
});
//# sourceMappingURL=Menu.js.map