import { Time } from '@internationalized/date';
import type { MinuteStep } from './TimeSelector.model';
import { TimeListSelector, type TimeSelectorLabels } from './TimeListSelector';
import { TimeWheelSelector } from './TimeWheelSelector';
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

export function TimeSelector(props: TimeSelectorProps) {
  return props.presentation === 'mobile' ? (
    <TimeWheelSelector {...props} />
  ) : (
    <TimeListSelector {...props} />
  );
}
