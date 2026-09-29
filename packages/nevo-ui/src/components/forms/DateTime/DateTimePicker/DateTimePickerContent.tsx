import { isSameDay, now, Time, type ZonedDateTime } from '@internationalized/date';
import { useContext, useState } from 'react';
import { DatePickerStateContext } from 'react-aria-components';
import { SegmentedControl } from '../../SegmentedControl';
import { DateCalendarPanel } from '../shared/CalendarPanel';
import { PickerActions } from '../shared/PickerActions';
import { TimeSelector } from '../shared/TimeSelector';
import { minuteStepDelta, type MinuteStep } from '../shared/TimeSelector.model';
import type { PickerPresentation } from '../shared/usePickerPresentation';
import type { DateTimePickerLabels } from './DateTimePicker';

function timeOf(value: ZonedDateTime) {
  return new Time(value.hour, value.minute);
}

function minuteOfDay(value: ZonedDateTime) {
  return value.hour * 60 + value.minute;
}

function ceilBoundaryToStep(value: ZonedDateTime, minuteStep: MinuteStep) {
  const minutes = minuteOfDay(value);
  const remainder = minutes % minuteStep;
  const hasSubMinuteValue = value.second !== 0 || value.millisecond !== 0;
  const delta =
    remainder === 0 && !hasSubMinuteValue
      ? 0
      : remainder === 0
        ? minuteStep
        : minuteStep - remainder;

  return value.set({ second: 0, millisecond: 0 }).add({ minutes: delta });
}

function floorBoundaryToStep(value: ZonedDateTime, minuteStep: MinuteStep) {
  const minutes = minuteOfDay(value);
  const remainder = minutes % minuteStep;

  return value.set({ second: 0, millisecond: 0 }).subtract({ minutes: remainder });
}

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

export function DateTimePickerContent({
  fallbackValue,
  hourCycle,
  labels,
  maxValue,
  minValue,
  minuteStep = 1,
  onCancel,
  onDone,
  presentation,
}: DateTimePickerContentProps) {
  const state = useContext(DatePickerStateContext);
  const [mobileStep, setMobileStep] = useState<'date' | 'time'>('date');
  const currentValue = (state?.value as ZonedDateTime | null) ?? fallbackValue;
  const time = timeOf(currentValue);
  const timeMin = minValue && isSameDay(currentValue, minValue) ? timeOf(minValue) : null;
  const timeMax = maxValue && isSameDay(currentValue, maxValue) ? timeOf(maxValue) : null;

  const setTime = (nextTime: Time) => {
    state?.setValue(
      currentValue.set({
        hour: nextTime.hour,
        minute: nextTime.minute,
        second: 0,
        millisecond: 0,
      }),
    );
  };

  const useCurrentTime = () => {
    const current = now(currentValue.timeZone).set({
      second: 0,
      millisecond: 0,
    });
    const delta = minuteStepDelta(new Time(current.hour, current.minute), minuteStep);
    let nextValue = current.add({ minutes: delta });
    if (minValue && nextValue.compare(minValue) < 0) {
      nextValue = ceilBoundaryToStep(minValue, minuteStep);
    }
    if (maxValue && nextValue.compare(maxValue) > 0) {
      nextValue = floorBoundaryToStep(maxValue, minuteStep);
    }
    state?.setValue(nextValue);
    if (presentation === 'mobile') setMobileStep('time');
  };

  if (presentation === 'mobile') {
    return (
      <div className="mx-auto grid w-full max-w-xs min-w-0 gap-4">
        <SegmentedControl
          aria-label={labels.dialog}
          className="w-full"
          value={mobileStep}
          onValueChange={(value) => setMobileStep(value as 'date' | 'time')}
        >
          <SegmentedControl.Item value="date">{labels.date}</SegmentedControl.Item>
          <SegmentedControl.Item value="time">{labels.time}</SegmentedControl.Item>
        </SegmentedControl>

        {mobileStep === 'date' ? (
          <DateCalendarPanel />
        ) : (
          <TimeSelector
            hourCycle={hourCycle}
            labels={labels}
            maxValue={timeMax}
            minValue={timeMin}
            minuteStep={minuteStep}
            presentation="mobile"
            value={time}
            onChange={setTime}
          />
        )}

        <PickerActions labels={labels} onCancel={onCancel} onDone={onDone} onNow={useCurrentTime} />
      </div>
    );
  }

  return (
    <div className="grid gap-3 p-3">
      <div className="grid grid-cols-[auto_16rem] gap-4">
        <DateCalendarPanel />
        <div className="border-l border-border-subtle pl-4">
          <TimeSelector
            hourCycle={hourCycle}
            labels={labels}
            maxValue={timeMax}
            minValue={timeMin}
            minuteStep={minuteStep}
            presentation="desktop"
            value={time}
            onChange={setTime}
          />
        </div>
      </div>
      <PickerActions labels={labels} onCancel={onCancel} onDone={onDone} onNow={useCurrentTime} />
    </div>
  );
}
