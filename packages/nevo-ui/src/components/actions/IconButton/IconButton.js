import { jsx as _jsx } from "react/jsx-runtime";
import { forwardRef } from 'react';
import { tv } from 'tailwind-variants/lite';
import { designSlot, useDesignMetadata } from '@nevo/figma-core/metadata';
import { actionVariantClasses, fastColorTransitionClassName, } from '../../../design-system/interactionRecipes';
import { cn } from '../../../lib';
import { Icon } from '../../foundations/Icon';
export const iconButtonDefaults = { variant: 'ghost', size: 'md' };
export const iconButtonVariants = tv({
    base: `inline-flex shrink-0 cursor-pointer items-center justify-center border border-solid disabled:pointer-events-none disabled:opacity-50 ${fastColorTransitionClassName}`,
    variants: {
        variant: {
            ...actionVariantClasses,
        },
        size: {
            xs: 'size-control-height-inline rounded-control-inline',
            sm: 'size-control-height-compact rounded-control',
            md: 'size-control-height-default rounded-control',
        },
    },
    defaultVariants: iconButtonDefaults,
});
export const IconButton = forwardRef(function IconButton({ 'aria-label': ariaLabel, className, disabled, icon, size = iconButtonDefaults.size, type = 'button', variant = iconButtonDefaults.variant, ...props }, ref) {
    const capture = useDesignMetadata('IconButton', {
        variant,
        size,
        state: disabled ? 'disabled' : 'default',
    });
    const iconSize = size === 'md' ? 'md' : 'sm';
    return (_jsx("button", { ref: ref, "aria-label": ariaLabel, className: cn(iconButtonVariants({ variant, size }), className), disabled: disabled, type: type, ...props, ...capture, children: _jsx("span", { className: "inline-flex shrink-0 items-center justify-center text-current", ...designSlot('IconButton', 'icon'), children: _jsx(Icon, { name: icon, size: iconSize }) }) }));
});
//# sourceMappingURL=IconButton.js.map