import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import { forwardRef, useId, } from 'react';
import { cn } from '../../../lib';
import { designSlot, useDesignMetadata } from '@nevo/figma-core/metadata';
export const RadioGroup = forwardRef(function RadioGroup({ className, ...props }, ref) {
    const capture = useDesignMetadata('RadioGroup');
    const { children, ...rootProps } = props;
    return (_jsx(RadioGroupPrimitive.Root, { ref: ref, className: cn('min-w-0', className), ...rootProps, ...capture, children: _jsx("div", { className: "grid gap-2", ...designSlot('RadioGroup', 'options'), children: children }) }));
});
export const RadioGroupItem = forwardRef(function RadioGroupItem({ className, ...props }, ref) {
    return (_jsx(RadioGroupPrimitive.Item, { ref: ref, className: cn('inline-flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border-default bg-surface-control outline-none', 'data-[state=checked]:border-action-primary disabled:cursor-not-allowed disabled:opacity-60', className), ...props, children: _jsx(RadioGroupPrimitive.Indicator, { className: "size-2 rounded-full bg-action-primary" }) }));
});
export function RadioGroupOption({ 'aria-describedby': ariaDescribedBy, description, disabled, id: idProp, label, optionClassName, ...props }) {
    const generatedId = useId();
    const id = idProp ?? `radio-${generatedId}`;
    const descriptionId = description ? `${id}-description` : undefined;
    const describedBy = [ariaDescribedBy, descriptionId].filter(Boolean).join(' ') || undefined;
    return (_jsxs("div", { className: cn('flex items-start gap-2.5', disabled && 'opacity-60', optionClassName), children: [_jsx(RadioGroupItem, { ...props, "aria-describedby": describedBy, disabled: disabled, id: id, className: "mt-0.5" }), _jsxs("div", { className: "min-w-0", children: [_jsx("label", { htmlFor: id, className: cn('block text-body-sm text-content-primary', disabled ? 'cursor-not-allowed' : 'cursor-pointer'), children: label }), description ? (_jsx("div", { id: descriptionId, className: "mt-0.5 text-body-sm text-content-muted", children: description })) : null] })] }));
}
//# sourceMappingURL=RadioGroup.js.map