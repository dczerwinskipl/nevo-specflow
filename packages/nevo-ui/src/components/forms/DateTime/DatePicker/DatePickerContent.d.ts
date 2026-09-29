import type { CalendarDate } from '@internationalized/date';
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
export declare function DatePickerContent({ labels, maxValue, minValue, onCancel, onDone, presentation, }: DatePickerContentProps): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=DatePickerContent.d.ts.map