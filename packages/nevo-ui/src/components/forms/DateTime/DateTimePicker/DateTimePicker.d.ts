import { type ZonedDateTime } from '@internationalized/date';
import { type AriaAttributes } from 'react';
import { type DatePickerProps as AriaDatePickerProps } from 'react-aria-components';
import type { MinuteStep } from '../shared/TimeSelector.model';
import type { PickerPresentation } from '../shared/usePickerPresentation';
export interface DateTimePickerLabels {
    cancel: string;
    date: string;
    dialog: string;
    done: string;
    hour: string;
    minute: string;
    now: string;
    time: string;
}
export declare const defaultDateTimePickerLabels: DateTimePickerLabels;
export interface DateTimePickerProps extends Omit<AriaDatePickerProps<ZonedDateTime>, 'children' | 'className' | 'defaultOpen' | 'defaultValue' | 'granularity' | 'isDisabled' | 'isInvalid' | 'isOpen' | 'isReadOnly' | 'isRequired' | 'maxValue' | 'minValue' | 'onChange' | 'onOpenChange' | 'placeholderValue' | 'shouldCloseOnSelect' | 'value'> {
    className?: string;
    'aria-invalid'?: AriaAttributes['aria-invalid'];
    defaultOpen?: boolean;
    defaultTimeZone?: string;
    defaultValue?: ZonedDateTime | null;
    disabled?: boolean;
    invalid?: boolean;
    labels?: Partial<DateTimePickerLabels>;
    maxValue?: ZonedDateTime | null;
    minValue?: ZonedDateTime | null;
    minuteStep?: MinuteStep;
    onChange?: (value: ZonedDateTime | null) => void;
    onOpenChange?: (open: boolean) => void;
    open?: boolean;
    pickerPresentation?: PickerPresentation;
    placeholderValue?: ZonedDateTime;
    readOnly?: boolean;
    required?: boolean;
    value?: ZonedDateTime | null;
}
export declare function DateTimePicker({ 'aria-describedby': ariaDescribedBy, 'aria-invalid': ariaInvalid, 'aria-labelledby': ariaLabelledBy, className, defaultOpen, defaultTimeZone, defaultValue, disabled, hourCycle, invalid, labels: labelsProp, maxValue, minValue, minuteStep, onChange, onOpenChange, open, pickerPresentation, placeholderValue, readOnly, required, value, ...props }: DateTimePickerProps): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=DateTimePicker.d.ts.map