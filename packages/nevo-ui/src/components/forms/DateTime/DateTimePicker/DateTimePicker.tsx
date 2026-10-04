import { getLocalTimeZone, now, type ZonedDateTime } from '@internationalized/date';
import { useMemo, type AriaAttributes } from 'react';
import {
  DatePicker as AriaDatePicker,
  type DatePickerProps as AriaDatePickerProps,
} from 'react-aria-components';
import { designSlot, useDesignMetadata } from '@nevo/figma-capture/metadata';
import { cn } from '../../../../lib';
import { useFieldControl } from '../../Field';
import { isAriaInvalid } from '../../shared/textControlState';
import { AdaptivePickerSurface } from '../shared/AdaptivePickerSurface';
import { clampPickerValue } from '../shared/clampPickerValue';
import { DateControl } from '../shared/DateControl';
import { DateSegments } from '../shared/DateSegments';
import type { MinuteStep } from '../shared/TimeSelector.model';
import { usePickerDraftState } from '../shared/usePickerDraftState';
import type { PickerPresentation } from '../shared/usePickerPresentation';
import { usePickerPresentation } from '../shared/usePickerPresentation';
import { DateTimePickerContent } from './DateTimePickerContent';

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

export const defaultDateTimePickerLabels: DateTimePickerLabels = {
  cancel: 'Cancel',
  date: 'Date',
  dialog: 'Choose date and time',
  done: 'Done',
  hour: 'Hour',
  minute: 'Minute',
  now: 'Now',
  time: 'Time',
};

export interface DateTimePickerProps extends Omit<
  AriaDatePickerProps<ZonedDateTime>,
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
  | 'placeholderValue'
  | 'shouldCloseOnSelect'
  | 'value'
> {
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

export function DateTimePicker({
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  'aria-labelledby': ariaLabelledBy,
  className,
  defaultOpen,
  defaultTimeZone,
  defaultValue,
  disabled = false,
  hourCycle,
  invalid = false,
  labels: labelsProp,
  maxValue,
  minValue,
  minuteStep = 1,
  onChange,
  onOpenChange,
  open,
  pickerPresentation,
  placeholderValue,
  readOnly = false,
  required = false,
  value,
  ...props
}: DateTimePickerProps) {
  const labels = { ...defaultDateTimePickerLabels, ...labelsProp };
  const presentation = usePickerPresentation(pickerPresentation);
  const resolvedTimeZone = defaultTimeZone ?? getLocalTimeZone();
  const resolvedPlaceholder = useMemo(
    () => placeholderValue ?? now(resolvedTimeZone).set({ second: 0, millisecond: 0 }),
    [placeholderValue, resolvedTimeZone],
  );
  const fallbackValue = useMemo(
    () => clampPickerValue(resolvedPlaceholder, minValue, maxValue),
    [maxValue, minValue, resolvedPlaceholder],
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
  const resolvedInvalid = isAriaInvalid(field.ariaInvalid);
  const state = field.disabled ? 'disabled' : resolvedInvalid ? 'invalid' : 'default';
  const capture = useDesignMetadata('DateTimePicker', { state });

  return (
    <AriaDatePicker
      {...props}
      {...capture}
      aria-describedby={field.ariaDescribedBy}
      aria-labelledby={field.ariaLabelledBy}
      className={cn('w-full', className)}
      granularity="minute"
      hourCycle={hourCycle}
      id={field.id}
      isDisabled={field.disabled}
      isInvalid={resolvedInvalid}
      isOpen={picker.resolvedOpen}
      isReadOnly={readOnly}
      isRequired={required}
      maxValue={maxValue}
      minValue={minValue}
      placeholderValue={resolvedPlaceholder}
      shouldCloseOnSelect={false}
      value={picker.resolvedOpen ? picker.draftValue : picker.committedValue}
      onChange={(nextValue: ZonedDateTime | null) => {
        if (picker.resolvedOpen) picker.setDraftValue(nextValue);
        else picker.commitValue(nextValue);
      }}
      onOpenChange={picker.setOpen}
    >
      <DateControl
        controlSlot={designSlot('DateTimePicker', 'control')}
        triggerSlot={designSlot('DateTimePicker', 'trigger')}
      >
        <DateSegments />
      </DateControl>
      <AdaptivePickerSurface aria-label={labels.dialog} presentation={presentation}>
        <DateTimePickerContent
          fallbackValue={fallbackValue}
          hourCycle={hourCycle}
          labels={labels}
          maxValue={maxValue}
          minValue={minValue}
          minuteStep={minuteStep}
          presentation={presentation}
          onCancel={picker.cancel}
          onDone={picker.done}
        />
      </AdaptivePickerSurface>
    </AriaDatePicker>
  );
}
