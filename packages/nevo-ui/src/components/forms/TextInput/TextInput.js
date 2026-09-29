import { jsx as _jsx } from "react/jsx-runtime";
import { forwardRef } from 'react';
import { designSlot, useDesignMetadata } from '@nevo/figma-core/metadata';
import { cn } from '../../../lib';
import { useFieldControl } from '../Field';
import { useInputGroupControl } from '../InputGroup';
import { textControlDesignState } from '../shared/textControlState';
import '../shared/textControl.css';
const textInputBaseClassName = 'text-input w-full font-sans text-body-md text-content-primary transition-colors placeholder:text-content-placeholder disabled:cursor-not-allowed';
export const textInputControlClassName = `${textInputBaseClassName} h-control-height-default rounded-control border border-solid border-border-default bg-surface-control px-control-padding-default disabled:border-border-subtle disabled:bg-surface-subtle disabled:text-content-muted disabled:opacity-60`;
const inputGroupTextInputClassName = `${textInputBaseClassName} h-full min-w-0 flex-1 rounded-none border-0 bg-transparent p-0 outline-none disabled:bg-transparent disabled:text-content-muted disabled:opacity-100`;
export const TextInput = forwardRef(function TextInput({ 'aria-describedby': ariaDescribedBy, 'aria-invalid': ariaInvalid, autoFocus, className, disabled, id, type = 'text', ...props }, ref) {
    const inputGroup = useInputGroupControl();
    const field = useFieldControl({
        ariaDescribedBy,
        ariaInvalid,
        disabled: Boolean(disabled || inputGroup?.disabled),
        id,
    });
    const capture = useDesignMetadata('TextInput', {
        state: textControlDesignState({
            ariaInvalid: field.ariaInvalid,
            autoFocus,
            disabled: field.disabled,
        }),
    });
    const slot = inputGroup?.insideGroup
        ? designSlot('InputGroup', 'control')
        : field.insideField
            ? designSlot('Field', 'control')
            : {};
    return (_jsx("input", { ref: ref, "aria-describedby": field.ariaDescribedBy, "aria-invalid": field.ariaInvalid, autoFocus: autoFocus, className: cn(inputGroup?.insideGroup ? inputGroupTextInputClassName : textInputControlClassName, className), disabled: field.disabled, id: field.id, type: type, ...props, "data-control-surface": inputGroup?.insideGroup ? 'embedded' : undefined, ...slot, ...capture }));
});
//# sourceMappingURL=TextInput.js.map