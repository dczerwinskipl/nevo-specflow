import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { forwardRef, useState } from 'react';
import { designSlot, useDesignMetadata } from '@nevo/figma-core/metadata';
import { cn } from '../../../lib';
import { IconButton } from '../../actions/IconButton';
import { useFieldControl } from '../Field';
import { InputGroup } from '../InputGroup';
import { isAriaInvalid } from '../shared/textControlState';
import { TextInput } from '../TextInput';
const defaultPasswordInputLabels = {
    hide: 'Hide password',
    show: 'Show password',
};
export const PasswordInput = forwardRef(function PasswordInput({ 'aria-describedby': ariaDescribedBy, 'aria-invalid': ariaInvalid, 'aria-labelledby': ariaLabelledBy, className, disabled, id, labels: labelsProp, wrapperClassName, ...props }, ref) {
    const [visible, setVisible] = useState(false);
    const labels = { ...defaultPasswordInputLabels, ...labelsProp };
    const field = useFieldControl({
        ariaDescribedBy,
        ariaInvalid,
        ariaLabelledBy,
        disabled,
        id,
    });
    const invalid = isAriaInvalid(field.ariaInvalid);
    const state = field.disabled ? 'disabled' : invalid ? 'invalid' : 'default';
    const capture = useDesignMetadata('PasswordInput', { state });
    return (_jsx("div", { className: cn('w-full', wrapperClassName), ...capture, children: _jsxs(InputGroup, { disabled: field.disabled, ...designSlot('PasswordInput', 'control'), children: [_jsx(TextInput, { ref: ref, "aria-describedby": field.ariaDescribedBy, "aria-invalid": field.ariaInvalid, "aria-labelledby": field.ariaLabelledBy, className: className, disabled: field.disabled, id: field.id, type: visible ? 'text' : 'password', ...props }), _jsx(InputGroup.Action, { ...designSlot('PasswordInput', 'visibilityAction'), children: _jsx(IconButton, { "aria-label": visible ? labels.hide : labels.show, "aria-pressed": visible, icon: visible ? 'eye-off' : 'eye', size: "xs", variant: "ghost", onClick: () => setVisible((current) => !current) }) })] }) }));
});
//# sourceMappingURL=PasswordInput.js.map