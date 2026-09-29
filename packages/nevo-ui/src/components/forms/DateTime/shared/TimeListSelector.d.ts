import { Time } from '@internationalized/date';
import type { MinuteStep } from './TimeSelector.model';
export interface TimeSelectorLabels {
    hour: string;
    minute: string;
    time: string;
}
export interface TimeListSelectorProps {
    hourCycle?: 12 | 24;
    labels: TimeSelectorLabels;
    maxValue?: Time | null;
    minValue?: Time | null;
    minuteStep?: MinuteStep;
    onChange: (value: Time) => void;
    value: Time;
}
export declare function TimeListSelector({ hourCycle, labels, maxValue, minValue, minuteStep, onChange, value, }: TimeListSelectorProps): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=TimeListSelector.d.ts.map