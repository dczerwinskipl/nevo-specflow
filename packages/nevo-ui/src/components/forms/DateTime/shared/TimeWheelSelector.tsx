import { Time } from '@internationalized/date';
import { useMemo, type CSSProperties } from 'react';
import { ListBox, ListBoxItem } from 'react-aria-components';
import { cn } from '../../../../lib';
import {
  createHourOptions,
  createMinuteOptions,
  formatHour,
  formatMinute,
  nearestMinuteOption,
  withHour,
  withMinute,
} from './TimeSelector.model';
import type { MinuteStep } from './TimeSelector.model';
import type { TimeSelectorLabels } from './TimeListSelector';
import { useWheelColumnScroll } from './useWheelColumnScroll';

const wheelItemHeight = 40;
const visibleWheelItems = 5;
const wheelHeight = wheelItemHeight * visibleWheelItems;
const wheelPadding = wheelItemHeight * Math.floor(visibleWheelItems / 2);
const settleDelayMs = 140;

const wheelViewportStyle: CSSProperties = {
  height: wheelHeight,
  WebkitMaskImage:
    'linear-gradient(to bottom, transparent 0%, black 24%, black 76%, transparent 100%)',
  maskImage: 'linear-gradient(to bottom, transparent 0%, black 24%, black 76%, transparent 100%)',
};

const wheelItemStyle: CSSProperties = {
  height: wheelItemHeight,
};

const selectionBandStyle: CSSProperties = {
  height: wheelItemHeight,
};

function WheelColumn({
  ariaLabel,
  format,
  onSelect,
  options,
  selected,
}: {
  ariaLabel: string;
  format: (value: number) => string;
  onSelect: (value: number) => void;
  options: readonly number[];
  selected: number;
}) {
  const scrollSync = useWheelColumnScroll({
    itemHeight: wheelItemHeight,
    onSelect,
    options,
    selected,
    settleDelayMs,
  });

  return (
    <ListBox
      ref={scrollSync.listRef}
      aria-label={ariaLabel}
      className="relative z-20 h-full min-w-0 cursor-grab snap-y snap-mandatory overflow-y-auto px-2 outline-none active:cursor-grabbing [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      selectedKeys={new Set([String(selected)])}
      selectionMode="single"
      style={{ paddingBlock: wheelPadding }}
      onScroll={scrollSync.onScroll}
      onSelectionChange={scrollSync.onSelectionChange}
    >
      {options.map((option) => (
        <ListBoxItem
          key={option}
          id={String(option)}
          textValue={format(option)}
          style={wheelItemStyle}
          className={({ isFocused }) =>
            cn(
              'flex cursor-pointer snap-center items-center justify-center rounded-control px-2 font-sans text-body-lg text-content-primary outline-none',
              isFocused && 'outline outline-2 outline-focus-ring outline-offset-[-2px]',
            )
          }
        >
          {format(option)}
        </ListBoxItem>
      ))}
    </ListBox>
  );
}

export interface TimeWheelSelectorProps {
  hourCycle?: 12 | 24;
  labels: TimeSelectorLabels;
  maxValue?: Time | null;
  minValue?: Time | null;
  minuteStep?: MinuteStep;
  onChange: (value: Time) => void;
  value: Time;
}

export function TimeWheelSelector({
  hourCycle,
  labels,
  maxValue,
  minValue,
  minuteStep = 1,
  onChange,
  value,
}: TimeWheelSelectorProps) {
  const hourOptions = useMemo(
    () => createHourOptions(value, minValue, maxValue),
    [maxValue, minValue, value],
  );
  const minuteOptions = useMemo(
    () => createMinuteOptions(value, minuteStep, minValue, maxValue),
    [maxValue, minValue, minuteStep, value],
  );
  const minuteSelection = nearestMinuteOption(value, minuteStep, minValue, maxValue);

  return (
    <div aria-label={labels.time} className="grid min-w-0 gap-2" role="group">
      <div className="grid grid-cols-2 text-center text-section-label uppercase tracking-[0.12em] text-content-muted">
        <span>{labels.hour}</span>
        <span>{labels.minute}</span>
      </div>

      <div className="relative grid min-w-0 grid-cols-2 overflow-hidden" style={wheelViewportStyle}>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-1/2 z-10 -translate-y-1/2 rounded-control bg-surface-selected"
          style={selectionBandStyle}
        />

        <WheelColumn
          ariaLabel={labels.hour}
          format={(hour) => formatHour(hour, hourCycle)}
          options={hourOptions}
          selected={value.hour}
          onSelect={(hour) => onChange(withHour(value, hour, minValue, maxValue))}
        />
        <WheelColumn
          ariaLabel={labels.minute}
          format={formatMinute}
          options={minuteOptions}
          selected={minuteSelection}
          onSelect={(minute) => onChange(withMinute(value, minute, minValue, maxValue))}
        />
      </div>
    </div>
  );
}

