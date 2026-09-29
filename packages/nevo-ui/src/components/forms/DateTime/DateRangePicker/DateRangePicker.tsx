import { getLocalTimeZone, today, type CalendarDate } from '@internationalized/date';
import type { AriaAttributes } from 'react';
import {
  DateRangePicker as AriaDateRangePicker,
  type DateRangePickerProps as AriaDateRangePickerProps,
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
import { DateRangePickerContent } from './DateRangePickerContent';

export interface DateRangePickerLabels {
  cancel: string;
  dialog: string;
  done: string;
}

export const defaultDateRangePickerLabels: DateRangePickerLabels = {
  cancel: 'Cancel',
  dialog: 'Choose date range',
  done: 'Done',
};

type CalendarDateRange = Exclude<AriaDateRangePickerProps<CalendarDate>['value'], null | undefined>;

export interface DateRangePickerProps extends Omit<
  AriaDateRangePickerProps<CalendarDate>,
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

export function DateRangePicker({
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
}: DateRangePickerProps) {
  const labels = { ...defaultDateRangePickerLabels, ...labelsProp };
  const presentation = usePickerPresentation(pickerPresentation);
  const fallbackDate = clampPickerValue(today(getLocalTimeZone()), minValue, maxValue);
  const fallbackValue: CalendarDateRange = {
    start: fallbackDate,
    end: fallbackDate,
  };
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
  const capture = useDesignMetadata('DateRangePicker', { state });

  return (
    <AriaDateRangePicker
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
        controlSlot={designSlot('DateRangePicker', 'control')}
        triggerSlot={designSlot('DateRangePicker', 'trigger')}
      >
        <DateSegments slot="start" />
        <span aria-hidden="true" className="shrink-0 text-content-muted">
          –
        </span>
        <DateSegments slot="end" />
      </DateControl>
      <AdaptivePickerSurface aria-label={labels.dialog} presentation={presentation}>
        <DateRangePickerContent
          labels={labels}
          maxValue={maxValue}
          minValue={minValue}
          presentation={presentation}
          onCancel={picker.cancel}
          onDone={picker.done}
        />
      </AdaptivePickerSurface>
    </AriaDateRangePicker>
  );
}



