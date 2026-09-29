import { getLocalTimeZone, today, type CalendarDate } from '@internationalized/date';
import type { AriaAttributes } from 'react';
import {
  DatePicker as AriaDatePicker,
  type DatePickerProps as AriaDatePickerProps,
} from 'react-aria-components';
import { designSlot, useDesignMetadata } from '@nevo/figma-core/metadata';
import { cn } from '../../../../lib';
import { useFieldControl } from '../../Field';
import { AdaptivePickerSurface } from '../shared/AdaptivePickerSurface';
import { clampPickerValue } from '../shared/clampPickerValue';
import { DateControl } from '../shared/DateControl';
import { DateSegments } from '../shared/DateSegments';
import { usePickerDraftState } from '../shared/usePickerDraftState';
import type { PickerPresentation } from '../shared/usePickerPresentation';
import { usePickerPresentation } from '../shared/usePickerPresentation';
import { DatePickerContent } from './DatePickerContent';

export interface DatePickerLabels {
  cancel: string;
  dialog: string;
  done: string;
}

export const defaultDatePickerLabels: DatePickerLabels = {
  cancel: 'Cancel',
  dialog: 'Choose date',
  done: 'Done',
};

export interface DatePickerProps extends Omit<
  AriaDatePickerProps<CalendarDate>,
  | 'children'
  | 'className'
  | 'defaultOpen'
  | 'defaultValue'
  | 'granularity'
  | 'isDisabled'
  | 'isInvalid'
  | 'isOpen'
  | 'isReadOnly'
  | 'isRequired'
  | 'maxValue'
  | 'minValue'
  | 'onChange'
  | 'onOpenChange'
  | 'shouldCloseOnSelect'
  | 'value'
> {
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

export function DatePicker({
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  'aria-labelledby': ariaLabelledBy,
  className,
  defaultOpen,
  defaultValue,
  disabled = false,
  invalid = false,
  labels: labelsProp,
  maxValue,
  minValue,
  onChange,
  onOpenChange,
  open,
  pickerPresentation,
  readOnly = false,
  required = false,
  value,
  ...props
}: DatePickerProps) {
  const labels = { ...defaultDatePickerLabels, ...labelsProp };
  const presentation = usePickerPresentation(pickerPresentation);
  const fallbackValue = clampPickerValue(
    props.placeholderValue ?? today(getLocalTimeZone()),
    minValue,
    maxValue,
  );
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

  return (
    <AriaDatePicker
      {...props}
      {...capture}
      aria-describedby={field.ariaDescribedBy}
      aria-labelledby={field.ariaLabelledBy}
      className={cn('w-full', className)}
      granularity="day"
      id={field.id}
      isDisabled={field.disabled}
      isInvalid={resolvedInvalid}
      isOpen={picker.resolvedOpen}
      isReadOnly={readOnly}
      isRequired={required}
      maxValue={maxValue}
      minValue={minValue}
      shouldCloseOnSelect={false}
      value={picker.resolvedOpen ? picker.draftValue : picker.committedValue}
      onChange={(nextValue) => {
        if (picker.resolvedOpen) picker.setDraftValue(nextValue);
        else picker.commitValue(nextValue);
      }}
      onOpenChange={picker.setOpen}
    >
      <DateControl
        controlSlot={designSlot('DatePicker', 'control')}
        triggerSlot={designSlot('DatePicker', 'trigger')}
      >
        <DateSegments />
      </DateControl>
      <AdaptivePickerSurface aria-label={labels.dialog} presentation={presentation}>
        <DatePickerContent
          labels={labels}
          maxValue={maxValue}
          minValue={minValue}
          presentation={presentation}
          onCancel={picker.cancel}
          onDone={picker.done}
        />
      </AdaptivePickerSurface>
    </AriaDatePicker>
  );
}



