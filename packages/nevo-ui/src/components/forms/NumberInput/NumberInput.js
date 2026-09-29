import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Button as AriaButton, Group, Input, NumberField, } from 'react-aria-components';
import { designSlot, useDesignMetadata } from '@nevo/figma-core/metadata';
import { fastColorTransitionClassName } from '../../../design-system/interactionRecipes';
import { cn } from '../../../lib';
import { iconButtonVariants } from '../../actions/IconButton';
import { useFieldControl } from '../Field';
import { isAriaInvalid } from '../shared/textControlState';
const embeddedStepperFocusClassName = 'focus-visible:bg-surface-selected focus-visible:text-content-primary focus-visible:outline-none';
export function NumberInput({ 'aria-describedby': ariaDescribedBy, 'aria-invalid': ariaInvalid, 'aria-labelledby': ariaLabelledBy, className, disabled = false, id, invalid = false, maxValue, minValue, readOnly = false, required = false, showSteppers = true, ...props }) {
    const field = useFieldControl({
        ariaDescribedBy,
        ariaInvalid: invalid ? true : ariaInvalid,
        ariaLabelledBy,
        disabled,
        id,
    });
    const resolvedInvalid = isAriaInvalid(field.ariaInvalid);
    const state = field.disabled ? 'disabled' : resolvedInvalid ? 'invalid' : 'default';
    const steppers = showSteppers ? 'shown' : 'hidden';
    const capture = useDesignMetadata('NumberInput', { state, steppers });
    return (_jsx(NumberField, { ...props, ...capture, "aria-describedby": field.ariaDescribedBy, "aria-labelledby": field.ariaLabelledBy, className: cn('w-full', className), isDisabled: field.disabled, isInvalid: resolvedInvalid, isReadOnly: readOnly, isRequired: required, minValue: minValue, maxValue: maxValue, children: _jsxs(Group, { className: cn('flex h-control-height-default w-full min-w-0 items-center gap-1 rounded-control border border-solid border-border-default bg-surface-control px-control-padding-inline text-content-primary focus-within:border-focus-ring', 'data-[disabled]:border-border-subtle data-[disabled]:bg-surface-subtle data-[disabled]:text-content-muted data-[disabled]:opacity-60', 'data-[invalid]:border-border-error', fastColorTransitionClassName), ...designSlot('NumberInput', 'control'), children: [showSteppers ? (_jsx(AriaButton, { slot: "decrement", "data-focus-ring": "delegated", className: cn(iconButtonVariants({ variant: 'ghost', size: 'xs' }), embeddedStepperFocusClassName), ...designSlot('NumberInput', 'decrementAction'), children: _jsx("span", { "aria-hidden": "true", className: "text-label-md", children: "\u2212" }) })) : null, _jsx(Input, { id: field.id, className: "text-input min-w-0 flex-1 border-0 bg-transparent p-0 text-right font-sans text-body-md text-content-primary outline-none focus-visible:outline-none placeholder:text-content-placeholder disabled:cursor-not-allowed", "data-control-surface": "embedded", ...designSlot('NumberInput', 'input') }), showSteppers ? (_jsx(AriaButton, { slot: "increment", "data-focus-ring": "delegated", className: cn(iconButtonVariants({ variant: 'ghost', size: 'xs' }), embeddedStepperFocusClassName), ...designSlot('NumberInput', 'incrementAction'), children: _jsx("span", { "aria-hidden": "true", className: "text-label-md", children: "+" }) })) : null] }) }));
}
//# sourceMappingURL=NumberInput.js.map