import { Time } from '@internationalized/date';
import { type MinuteStep } from '../shared/TimeSelector.model';
import type { PickerPresentation } from '../shared/usePickerPresentation';
import type { TimePickerLabels } from './TimePicker';
export interface TimePickerContentProps {
    hourCycle?: 12 | 24;
    labels: TimePickerLabels;
    maxValue?: Time | null;
    minValue?: Time | null;
    minuteStep?: MinuteStep;
    onCancel: () => void;
    onChange: (value: Time) => void;
    onDone: () => void;
    presentation: PickerPresentation;
    value: Time;
}
export declare function TimePickerContent({ hourCycle, labels, maxValue, minValue, minuteStep, onCancel, onChange, onDone, presentation, value, }: TimePickerContentProps): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=TimePickerContent.d.ts.map