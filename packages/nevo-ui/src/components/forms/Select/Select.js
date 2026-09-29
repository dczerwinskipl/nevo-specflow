import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import * as SelectPrimitive from '@radix-ui/react-select';
import { createContext, forwardRef, useContext, } from 'react';
import { tv } from 'tailwind-variants/lite';
import { designSlot, useDesignMetadata } from '@nevo/figma-core/metadata';
import { floatingContentClassName, floatingItemVariants, floatingLabelClassName, floatingSeparatorClassName, } from '../../../design-system/floatingRecipes';
import { cn } from '../../../lib';
import { Icon } from '../../foundations/Icon';
import { Typography } from '../../foundations/Typography';
import { useFieldControl } from '../Field';
import { isAriaInvalid } from '../shared/textControlState';
import './Select.css';
const SelectContext = createContext({ disabled: false, invalid: false });
export function Select({ disabled = false, invalid = false, ...props }) {
    const field = useFieldControl({
        ariaInvalid: invalid ? true : undefined,
        disabled,
    });
    const resolvedInvalid = isAriaInvalid(field.ariaInvalid);
    return (_jsx(SelectContext.Provider, { value: { disabled: field.disabled, invalid: resolvedInvalid }, children: _jsx(SelectPrimitive.Root, { disabled: field.disabled, ...props }) }));
}
export const SelectGroup = SelectPrimitive.Group;
export const selectTriggerDefaults = { state: 'default' };
export const selectTriggerVariants = tv({
    base: 'select-trigger inline-flex h-control-height-default w-full min-w-0 cursor-pointer items-center justify-between gap-2 overflow-hidden rounded-control border border-solid bg-surface-control px-control-padding-default text-left text-body-md text-content-primary transition-colors data-[placeholder]:text-content-placeholder disabled:cursor-not-allowed [&>[data-design-slot=value]]:min-w-0 [&>[data-design-slot=value]]:flex-1 [&>[data-design-slot=value]]:overflow-hidden [&>[data-design-slot=value]]:text-ellipsis [&>[data-design-slot=value]]:whitespace-nowrap [&>[data-design-slot=value]>*]:block [&>[data-design-slot=value]>*]:overflow-hidden [&>[data-design-slot=value]>*]:text-ellipsis [&>[data-design-slot=value]>*]:whitespace-nowrap',
    variants: {
        state: {
            default: 'border-border-default',
            focus: 'border-focus-ring',
            disabled: 'border-border-subtle bg-surface-subtle text-content-muted opacity-60',
            invalid: 'border-border-error',
        },
    },
    defaultVariants: selectTriggerDefaults,
});
export const SelectTrigger = forwardRef(function SelectTrigger({ 'aria-describedby': ariaDescribedBy, 'aria-invalid': ariaInvalid, autoFocus, children, className, disabled: disabledProp, id, ...props }, ref) {
    const root = useContext(SelectContext);
    const field = useFieldControl({
        ariaDescribedBy,
        ariaInvalid: root.invalid ? true : ariaInvalid,
        disabled: Boolean(disabledProp || root.disabled),
        id,
    });
    const invalid = isAriaInvalid(field.ariaInvalid);
    const state = field.disabled ? 'disabled' : invalid ? 'invalid' : autoFocus ? 'focus' : 'default';
    const capture = useDesignMetadata('Select', { state });
    return (_jsxs(SelectPrimitive.Trigger, { ref: ref, "aria-describedby": field.ariaDescribedBy, "aria-invalid": field.ariaInvalid, autoFocus: autoFocus, className: cn(selectTriggerVariants({ state }), className), disabled: field.disabled, id: field.id, ...props, ...(field.insideField ? designSlot('Field', 'control') : {}), ...capture, children: [children, _jsx(SelectPrimitive.Icon, { asChild: true, children: _jsx("span", { className: "inline-flex shrink-0 text-content-muted", ...designSlot('Select', 'trailingIcon'), children: _jsx(Icon, { name: "chevron-down", size: "sm" }) }) })] }));
});
export const SelectValue = forwardRef(function SelectValue({ className, ...props }, ref) {
    return (_jsx(SelectPrimitive.Value, { ref: ref, className: cn('min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap', className), ...props, ...designSlot('Select', 'value') }));
});
export const SelectContent = forwardRef(function SelectContent({ align = 'start', children, className, container, position = 'popper', sideOffset = 8, ...props }, ref) {
    return (_jsx(SelectPrimitive.Portal, { container: container, children: _jsx(SelectPrimitive.Content, { ref: ref, align: align, className: cn('select-content w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-2rem)]', floatingContentClassName, className), position: position, sideOffset: sideOffset, ...props, children: _jsx(SelectPrimitive.Viewport, { className: "max-h-72 p-0", children: children }) }) }));
});
export const SelectItem = forwardRef(function SelectItem({ autoFocus, children, className, disabled, ...props }, ref) {
    const capture = useDesignMetadata('SelectItem', {
        state: disabled ? 'disabled' : autoFocus ? 'highlighted' : 'default',
    });
    return (_jsxs(SelectPrimitive.Item, { ref: ref, autoFocus: autoFocus, className: cn('pr-8', floatingItemVariants(), className), "data-design-token-background": autoFocus ? 'Color/surface-hover' : undefined, disabled: disabled, ...props, ...capture, children: [_jsx(SelectPrimitive.ItemText, { asChild: true, children: _jsx(Typography, { className: "min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-current", ...designSlot('SelectItem', 'label'), variant: "body-sm", children: children }) }), _jsx(SelectPrimitive.ItemIndicator, { asChild: true, children: _jsx("span", { className: "absolute right-control-padding-compact inline-flex text-content-primary", ...designSlot('SelectItem', 'indicator'), children: _jsx(Icon, { name: "check", size: "sm" }) }) })] }));
});
export const SelectLabel = forwardRef(function SelectLabel({ children, className, ...props }, ref) {
    return (_jsx(SelectPrimitive.Label, { ref: ref, className: cn(floatingLabelClassName, className), ...props, children: _jsx(Typography, { as: "span", className: "text-inherit", variant: "section-label", children: children }) }));
});
export const SelectSeparator = forwardRef(function SelectSeparator({ className, ...props }, ref) {
    return (_jsx(SelectPrimitive.Separator, { ref: ref, className: cn(floatingSeparatorClassName, className), ...props }));
});
//# sourceMappingURL=Select.js.map