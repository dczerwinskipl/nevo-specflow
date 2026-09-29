import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { getLocalTimeZone, today } from '@internationalized/date';
import { DatePicker as AriaDatePicker, } from 'react-aria-components';
import { designSlot, useDesignMetadata } from '@nevo/figma-core/metadata';
import { cn } from '../../../../lib';
import { useFieldControl } from '../../Field';
import { AdaptivePickerSurface } from '../shared/AdaptivePickerSurface';
import { clampPickerValue } from '../shared/clampPickerValue';
import { DateControl } from '../shared/DateControl';
import { DateSegments } from '../shared/DateSegments';
import { usePickerDraftState } from '../shared/usePickerDraftState';
import { usePickerPresentation } from '../shared/usePickerPresentation';
import { DatePickerContent } from './DatePickerContent';
export const defaultDatePickerLabels = {
    cancel: 'Cancel',
    dialog: 'Choose date',
    done: 'Done',
};
export function DatePicker({ 'aria-describedby': ariaDescribedBy, 'aria-invalid': ariaInvalid, 'aria-labelledby': ariaLabelledBy, className, defaultOpen, defaultValue, disabled = false, invalid = false, labels: labelsProp, maxValue, minValue, onChange, onOpenChange, open, pickerPresentation, readOnly = false, required = false, value, ...props }) {
    const labels = { ...defaultDatePickerLabels, ...labelsProp };
    const presentation = usePickerPresentation(pickerPresentation);
    const fallbackValue = clampPickerValue(props.placeholderValue ?? today(getLocalTimeZone()), minValue, maxValue);
    const picker = usePickerDraftState({
        defaultOpen,
        defaultValue,
        fallbackValue,
        onChange,
        onOpenChange,
        open,
        value,
    });
    const field = useFieldControl({
        ariaDescribedBy,
        ariaInvalid: invalid ? true : ariaInvalid,
        ariaLabelledBy,
        disabled,
        id: props.id,
    });
    const resolvedInvalid = field.ariaInvalid === true || field.ariaInvalid === 'true';
    const state = field.disabled ? 'disabled' : resolvedInvalid ? 'invalid' : 'default';
    const capture = useDesignMetadata('DatePicker', { state });
    return (_jsxs(AriaDatePicker, { ...props, ...capture, "aria-describedby": field.ariaDescribedBy, "aria-labelledby": field.ariaLabelledBy, className: cn('w-full', className), granularity: "day", id: field.id, isDisabled: field.disabled, isInvalid: resolvedInvalid, isOpen: picker.resolvedOpen, isReadOnly: readOnly, isRequired: required, maxValue: maxValue, minValue: minValue, shouldCloseOnSelect: false, value: picker.resolvedOpen ? picker.draftValue : picker.committedValue, onChange: (nextValue) => {
            if (picker.resolvedOpen)
                picker.setDraftValue(nextValue);
            else
                picker.commitValue(nextValue);
        }, onOpenChange: picker.setOpen, children: [_jsx(DateControl, { controlSlot: designSlot('DatePicker', 'control'), triggerSlot: designSlot('DatePicker', 'trigger'), children: _jsx(DateSegments, {}) }), _jsx(AdaptivePickerSurface, { "aria-label": labels.dialog, presentation: presentation, children: _jsx(DatePickerContent, { labels: labels, maxValue: maxValue, minValue: minValue, presentation: presentation, onCancel: picker.cancel, onDone: picker.done }) })] }));
}
//# sourceMappingURL=DatePicker.js.map