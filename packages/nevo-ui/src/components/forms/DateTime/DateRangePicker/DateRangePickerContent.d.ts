import type { CalendarDate } from '@internationalized/date';
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
export declare function DateRangePickerContent({ labels, maxValue, minValue, onCancel, onDone, presentation, }: DateRangePickerContentProps): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=DateRangePickerContent.d.ts.map