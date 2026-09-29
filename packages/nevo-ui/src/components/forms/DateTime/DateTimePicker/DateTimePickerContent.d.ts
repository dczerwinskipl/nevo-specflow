import { type ZonedDateTime } from '@internationalized/date';
import { type MinuteStep } from '../shared/TimeSelector.model';
import type { PickerPresentation } from '../shared/usePickerPresentation';
import type { DateTimePickerLabels } from './DateTimePicker';
export interface DateTimePickerContentProps {
    fallbackValue: ZonedDateTime;
    hourCycle?: 12 | 24;
    labels: DateTimePickerLabels;
    maxValue?: ZonedDateTime | null;
    minValue?: ZonedDateTime | null;
    minuteStep?: MinuteStep;
    onCancel: () => void;
    onDone: () => void;
    presentation: PickerPresentation;
}
export declare function DateTimePickerContent({ fallbackValue, hourCycle, labels, maxValue, minValue, minuteStep, onCancel, onDone, presentation, }: DateTimePickerContentProps): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=DateTimePickerContent.d.ts.map