import { Time } from '@internationalized/date';
import type { AriaAttributes } from 'react';
import { type TimeFieldProps as AriaTimeFieldProps } from 'react-aria-components';
import type { PickerPresentation } from '../shared/usePickerPresentation';
import type { MinuteStep } from '../shared/TimeSelector.model';
export interface TimePickerLabels {
    cancel: string;
    dialog: string;
    done: string;
    hour: string;
    minute: string;
    now: string;
    time: string;
    trigger: string;
}
export declare const defaultTimePickerLabels: TimePickerLabels;
export interface TimePickerProps extends Omit<AriaTimeFieldProps<Time>, 'children' | 'className' | 'granularity' | 'isDisabled' | 'isInvalid' | 'isReadOnly' | 'isRequired' | 'defaultValue' | 'maxValue' | 'minValue' | 'onChange' | 'value'> {
    className?: string;
    'aria-invalid'?: AriaAttributes['aria-invalid'];
    defaultOpen?: boolean;
    defaultValue?: Time | null;
    disabled?: boolean;
    invalid?: boolean;
    labels?: Partial<TimePickerLabels>;
    maxValue?: Time | null;
    minValue?: Time | null;
    minuteStep?: MinuteStep;
    onChange?: (value: Time | null) => void;
    onOpenChange?: (open: boolean) => void;
    open?: boolean;
    pickerPresentation?: PickerPresentation;
    readOnly?: boolean;
    required?: boolean;
    value?: Time | null;
}
export declare function TimePicker({ 'aria-describedby': ariaDescribedBy, 'aria-invalid': ariaInvalid, 'aria-labelledby': ariaLabelledBy, className, defaultOpen, defaultValue, disabled, hourCycle, invalid, labels: labelsProp, maxValue, minValue, minuteStep, onChange, onOpenChange, open, pickerPresentation, readOnly, required, value, ...props }: TimePickerProps): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=TimePicker.d.ts.map