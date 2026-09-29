import { Time } from '@internationalized/date';
import type { MinuteStep } from './TimeSelector.model';
import { type TimeSelectorLabels } from './TimeListSelector';
import type { PickerPresentation } from './usePickerPresentation';
export interface TimeSelectorProps {
    hourCycle?: 12 | 24;
    labels: TimeSelectorLabels;
    maxValue?: Time | null;
    minValue?: Time | null;
    minuteStep?: MinuteStep;
    onChange: (value: Time) => void;
    presentation: PickerPresentation;
    value: Time;
}
export declare function TimeSelector(props: TimeSelectorProps): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=TimeSelector.d.ts.map