import { type CalendarDate } from '@internationalized/date';
import type { AriaAttributes } from 'react';
import { type DateRangePickerProps as AriaDateRangePickerProps } from 'react-aria-components';
import type { PickerPresentation } from '../shared/usePickerPresentation';
export interface DateRangePickerLabels {
    cancel: string;
    dialog: string;
    done: string;
}
export declare const defaultDateRangePickerLabels: DateRangePickerLabels;
type CalendarDateRange = Exclude<AriaDateRangePickerProps<CalendarDate>['value'], null | undefined>;
export interface DateRangePickerProps extends Omit<AriaDateRangePickerProps<CalendarDate>, 'children' | 'className' | 'defaultOpen' | 'defaultValue' | 'granularity' | 'isDisabled' | 'isInvalid' | 'isOpen' | 'isReadOnly' | 'isRequired' | 'maxValue' | 'minValue' | 'onChange' | 'onOpenChange' | 'shouldCloseOnSelect' | 'value'> {
    className?: string;
    'aria-invalid'?: AriaAttributes['aria-invalid'];
    defaultOpen?: boolean;
    defaultValue?: CalendarDateRange | null;
    disabled?: boolean;
    invalid?: boolean;
    labels?: Partial<DateRangePickerLabels>;
    maxValue?: CalendarDate | null;
    minValue?: CalendarDate | null;
    onChange?: (value: CalendarDateRange | null) => void;
    onOpenChange?: (open: boolean) => void;
    open?: boolean;
    pickerPresentation?: PickerPresentation;
    readOnly?: boolean;
    required?: boolean;
    value?: CalendarDateRange | null;
}
export declare function DateRangePicker({ 'aria-describedby': ariaDescribedBy, 'aria-invalid': ariaInvalid, 'aria-labelledby': ariaLabelledBy, className, defaultOpen, defaultValue, disabled, invalid, labels: labelsProp, maxValue, minValue, onChange, onOpenChange, open, pickerPresentation, readOnly, required, value, ...props }: DateRangePickerProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=DateRangePicker.d.ts.map