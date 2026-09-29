import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { forwardRef, useId, } from 'react';
import { cn } from '../../../lib';
import { designSlot, useDesignMetadata } from '@nevo/figma-core/metadata';
import { useFieldControl } from '../Field';
export const Switch = forwardRef(function Switch({ 'aria-describedby': ariaDescribedBy, 'aria-invalid': ariaInvalid, className, checked, defaultChecked, disabled, id, ...props }, ref) {
    const field = useFieldControl({ ariaDescribedBy, ariaInvalid, disabled, id });
    const capture = useDesignMetadata('Switch', {
        state: disabled ? 'disabled' : (checked ?? defaultChecked) ? 'checked' : 'default',
    });
    return (_jsx(SwitchPrimitive.Root, { ref: ref, "aria-describedby": field.ariaDescribedBy, "aria-invalid": field.ariaInvalid, className: cn('relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-border-default bg-surface-control p-0.5 outline-none transition-colors', 'data-[state=checked]:border-action-primary data-[state=checked]:bg-action-primary disabled:cursor-not-allowed disabled:opacity-60', className), checked: checked, defaultChecked: defaultChecked, disabled: field.disabled, id: field.id, ...props, ...capture, children: _jsx(SwitchPrimitive.Thumb, { className: "block size-3.5 rounded-full bg-content-primary shadow transition-transform data-[state=checked]:translate-x-4", ...designSlot('Switch', 'thumb') }) }));
});
export function SwitchField({ 'aria-describedby': ariaDescribedBy, description, disabled, fieldClassName, id: idProp, label, ...props }) {
    const generatedId = useId();
    const id = idProp ?? `switch-${generatedId}`;
    const descriptionId = description ? `${id}-description` : undefined;
    const describedBy = [ariaDescribedBy, descriptionId].filter(Boolean).join(' ') || undefined;
    return (_jsxs("div", { className: cn('flex items-start justify-between gap-4', disabled && 'opacity-60', fieldClassName), children: [_jsxs("div", { className: "min-w-0", children: [_jsx("label", { htmlFor: id, className: cn('block text-body-sm text-content-primary', disabled ? 'cursor-not-allowed' : 'cursor-pointer'), children: label }), description ? (_jsx("div", { id: descriptionId, className: "mt-0.5 text-body-sm text-content-muted", children: description })) : null] }), _jsx(Switch, { ...props, "aria-describedby": describedBy, disabled: disabled, id: id, className: "mt-0.5" })] }));
}
//# sourceMappingURL=Switch.js.map