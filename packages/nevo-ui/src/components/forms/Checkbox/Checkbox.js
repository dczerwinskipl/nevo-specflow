import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { forwardRef, useId, } from 'react';
import { cn } from '../../../lib';
import { designSlot, useDesignMetadata } from '@nevo/figma-core/metadata';
import { Icon } from '../../foundations/Icon';
import { useFieldControl } from '../Field';
export const Checkbox = forwardRef(function Checkbox({ 'aria-describedby': ariaDescribedBy, 'aria-invalid': ariaInvalid, checked, className, defaultChecked, disabled, id, indeterminate = false, ...props }, ref) {
    const field = useFieldControl({ ariaDescribedBy, ariaInvalid, disabled, id });
    const state = indeterminate ? 'indeterminate' : checked;
    const designState = disabled
        ? 'disabled'
        : indeterminate
            ? 'indeterminate'
            : (checked ?? defaultChecked) === true
                ? 'checked'
                : 'default';
    const capture = useDesignMetadata('Checkbox', { state: designState });
    return (_jsx(CheckboxPrimitive.Root, { ref: ref, "aria-describedby": field.ariaDescribedBy, "aria-invalid": field.ariaInvalid, checked: state, defaultChecked: defaultChecked, className: cn('inline-flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-control-inline border border-border-default bg-surface-control text-content-on-primary outline-none', 'data-[state=checked]:border-action-primary data-[state=checked]:bg-action-primary data-[state=indeterminate]:border-action-primary data-[state=indeterminate]:bg-action-primary', 'disabled:cursor-not-allowed disabled:border-border-subtle disabled:bg-surface-subtle disabled:opacity-60', className), disabled: field.disabled, id: field.id, ...props, ...capture, children: _jsx(CheckboxPrimitive.Indicator, { className: "inline-flex items-center justify-center", ...designSlot('Checkbox', 'indicator'), children: state === 'indeterminate' ? (_jsx("span", { "aria-hidden": true, className: "block h-0.5 w-2 rounded-full bg-current" })) : (_jsx(Icon, { name: "check", size: "sm", className: "size-3" })) }) }));
});
export function CheckboxField({ 'aria-describedby': ariaDescribedBy, description, disabled, fieldClassName, id: idProp, label, ...props }) {
    const generatedId = useId();
    const id = idProp ?? `checkbox-${generatedId}`;
    const descriptionId = description ? `${id}-description` : undefined;
    const describedBy = [ariaDescribedBy, descriptionId].filter(Boolean).join(' ') || undefined;
    return (_jsxs("div", { className: cn('flex items-start gap-2.5', disabled && 'opacity-60', fieldClassName), children: [_jsx(Checkbox, { ...props, "aria-describedby": describedBy, disabled: disabled, id: id, className: "mt-0.5" }), _jsxs("div", { className: "min-w-0", children: [_jsx("label", { htmlFor: id, className: cn('block text-body-sm text-content-primary', disabled ? 'cursor-not-allowed' : 'cursor-pointer'), children: label }), description ? (_jsx("div", { id: descriptionId, className: "mt-0.5 text-body-sm text-content-muted", children: description })) : null] })] }));
}
//# sourceMappingURL=Checkbox.js.map