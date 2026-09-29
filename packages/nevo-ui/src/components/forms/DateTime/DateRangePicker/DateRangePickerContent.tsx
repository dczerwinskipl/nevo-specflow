import type { CalendarDate } from '@internationalized/date';
import { DateRangeCalendarPanel } from '../shared/CalendarPanel';
import { PickerActions } from '../shared/PickerActions';
import type { PickerPresentation } from '../shared/usePickerPresentation';
import type { DateRangePickerLabels } from './DateRangePicker';

export interface DateRangePickerContentProps {
  labels: DateRangePickerLabels;
  maxValue?: CalendarDate | null;
  minValue?: CalendarDate | null;
  onCancel: () => void;
  onDone: () => void;
  presentation: PickerPresentation;
}

export function DateRangePickerContent({
  labels,
  maxValue,
  minValue,
  onCancel,
  onDone,
  presentation,
}: DateRangePickerContentProps) {
  return (
    <div
      className={
        presentation === 'mobile' ? 'mx-auto grid w-full max-w-64 min-w-0 gap-4' : 'grid gap-3 p-3'
      }
    >
      <DateRangeCalendarPanel maxValue={maxValue} minValue={minValue} />
      <PickerActions labels={labels} onCancel={onCancel} onDone={onDone} />
    </div>
  );
}

