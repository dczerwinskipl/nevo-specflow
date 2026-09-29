import { type CalendarDate } from '@internationalized/date';
import type { AriaAttributes } from 'react';
import { type DatePickerProps as AriaDatePickerProps } from 'react-aria-components';
import type { PickerPresentation } from '../shared/usePickerPresentation';
export interface DatePickerLabels {
    cancel: string;
    dialog: string;
    done: string;
}
export declare const defaultDatePickerLabels: DatePickerLabels;
export interface DatePickerProps extends Omit<AriaDatePickerProps<CalendarDate>, 'children' | 'className' | 'defaultOpen' | 'defaultValue' | 'granularity' | 'isDisabled' | 'isInvalid' | 'isOpen' | 'isReadOnly' | 'isRequired' | 'maxValue' | 'minValue' | 'onChange' | 'onOpenChange' | 'shouldCloseOnSelect' | 'value'> {
    className?: string;
    'aria-invalid'?: AriaAttributes['aria-invalid'];
    defaultOpen?: boolean;
    defaultValue?: CalendarDate | null;
    disabled?: boolean;
    invalid?: boolean;
    labels?: Partial<DatePickerLabels>;
    maxValue?: CalendarDate | null;
    minValue?: CalendarDate | null;
    onChange?: (value: CalendarDate | null) => void;
    onOpenChange?: (open: boolean) => void;
    open?: boolean;
    pickerPresentation?: PickerPresentation;
    readOnly?: boolean;
    required?: boolean;
    value?: CalendarDate | null;
}
export declare function DatePicker({ 'aria-describedby': ariaDescribedBy, 'aria-invalid': ariaInvalid, 'aria-labelledby': ariaLabelledBy, className, defaultOpen, defaultValue, disabled, invalid, labels: labelsProp, maxValue, minValue, onChange, onOpenChange, open, pickerPresentation, readOnly, required, value, ...props }: DatePickerProps): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=DatePicker.d.ts.map