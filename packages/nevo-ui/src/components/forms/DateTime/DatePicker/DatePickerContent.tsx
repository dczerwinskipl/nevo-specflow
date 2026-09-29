import type { CalendarDate } from '@internationalized/date';
import { DateCalendarPanel } from '../shared/CalendarPanel';
import { PickerActions } from '../shared/PickerActions';
import type { PickerPresentation } from '../shared/usePickerPresentation';
import type { DatePickerLabels } from './DatePicker';

export interface DatePickerContentProps {
  labels: DatePickerLabels;
  maxValue?: CalendarDate | null;
  minValue?: CalendarDate | null;
  onCancel: () => void;
  onDone: () => void;
  presentation: PickerPresentation;
}

export function DatePickerContent({
  labels,
  maxValue,
  minValue,
  onCancel,
  onDone,
  presentation,
}: DatePickerContentProps) {
  return (
    <div
      className={
        presentation === 'mobile' ? 'mx-auto grid w-full max-w-64 min-w-0 gap-4' : 'grid gap-3 p-3'
      }
    >
      <DateCalendarPanel maxValue={maxValue} minValue={minValue} />
      <PickerActions labels={labels} onCancel={onCancel} onDone={onDone} />
    </div>
  );
}

