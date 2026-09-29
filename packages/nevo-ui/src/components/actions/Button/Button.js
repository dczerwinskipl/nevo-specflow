import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { forwardRef } from 'react';
import { tv } from 'tailwind-variants/lite';
import { designSlot, useDesignMetadata } from '@nevo/figma-core/metadata';
import { actionVariantClasses, fastColorTransitionClassName, } from '../../../design-system/interactionRecipes';
import { cn } from '../../../lib';
import { Icon } from '../../foundations/Icon';
import { Typography } from '../../foundations/Typography';
export const buttonDefaults = { variant: 'primary', size: 'md' };
export const buttonVariants = tv({
    base: `inline-flex w-fit cursor-pointer items-center justify-center whitespace-nowrap border border-solid disabled:pointer-events-none disabled:opacity-50 ${fastColorTransitionClassName}`,
    variants: {
        variant: {
            ...actionVariantClasses,
        },
        size: {
            sm: 'h-control-height-compact gap-1.5 rounded-control px-control-padding-compact',
            md: 'h-control-height-default gap-2 rounded-control px-control-padding-default',
        },
    },
    defaultVariants: buttonDefaults,
});
const labelTypographyBySize = {
    sm: 'label-sm',
    md: 'label-md',
};
export const Button = forwardRef(function Button({ children, className, disabled, leadingIcon, size = buttonDefaults.size, trailingIcon, type = 'button', variant = buttonDefaults.variant, ...props }, ref) {
    const capture = useDesignMetadata('Button', {
        variant,
        size,
        // Kept as State for this PoC because changing an existing ComponentSet axis
        // would invalidate current stable variant IDs during reconciliation.
        state: disabled ? 'disabled' : 'default',
    });
    return (_jsxs("button", { ref: ref, className: cn(buttonVariants({ variant, size }), className), disabled: disabled, type: type, ...props, ...capture, children: [leadingIcon ? (_jsx("span", { className: "inline-flex shrink-0 items-center justify-center text-current", ...designSlot('Button', 'leadingIcon'), children: _jsx(Icon, { name: leadingIcon, size: size }) })) : null, _jsx(Typography, { className: "block text-current", ...designSlot('Button', 'label'), variant: labelTypographyBySize[size], children: children }), trailingIcon ? (_jsx("span", { className: "inline-flex shrink-0 items-center justify-center text-current", ...designSlot('Button', 'trailingIcon'), children: _jsx(Icon, { name: trailingIcon, size: size }) })) : null] }));
});
//# sourceMappingURL=Button.js.map