import { Time } from '@internationalized/date';
import type { MinuteStep } from './TimeSelector.model';
import type { TimeSelectorLabels } from './TimeListSelector';
export interface TimeWheelSelectorProps {
    hourCycle?: 12 | 24;
    labels: TimeSelectorLabels;
    maxValue?: Time | null;
    minValue?: Time | null;
    minuteStep?: MinuteStep;
    onChange: (value: Time) => void;
    value: Time;
}
export declare function TimeWheelSelector({ hourCycle, labels, maxValue, minValue, minuteStep, onChange, value, }: TimeWheelSelectorProps): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=TimeWheelSelector.d.ts.map