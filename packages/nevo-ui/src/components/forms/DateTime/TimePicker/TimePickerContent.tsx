import { Time } from '@internationalized/date';
import { PickerActions } from '../shared/PickerActions';
import { TimeSelector } from '../shared/TimeSelector';
import { snapTimeToMinuteStep, type MinuteStep } from '../shared/TimeSelector.model';
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

export function TimePickerContent({
  hourCycle,
  labels,
  maxValue,
  minValue,
  minuteStep = 1,
  onCancel,
  onChange,
  onDone,
  presentation,
  value,
}: TimePickerContentProps) {
  const useCurrentTime = () => {
    const current = new Date();

    onChange(
      snapTimeToMinuteStep(
        new Time(current.getHours(), current.getMinutes()),
        minuteStep,
        minValue,
        maxValue,
      ),
    );
  };

  return (
    <div
      className={
        presentation === 'mobile'
          ? 'mx-auto grid w-full max-w-xs min-w-0 gap-4'
          : 'grid min-w-72 gap-3 p-3'
      }
    >
      <TimeSelector
        hourCycle={hourCycle}
        labels={labels}
        maxValue={maxValue}
        minValue={minValue}
        minuteStep={minuteStep}
        presentation={presentation}
        value={value}
        onChange={onChange}
      />
      <PickerActions labels={labels} onCancel={onCancel} onDone={onDone} onNow={useCurrentTime} />
    </div>
  );
}

