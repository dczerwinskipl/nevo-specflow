import { Time } from '@internationalized/date';
import { useEffect, useMemo, useRef } from 'react';
import {
  ListBox,
  ListBoxItem,
  type ListBoxItemRenderProps,
  type Selection,
} from 'react-aria-components';
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

export interface TimeSelectorLabels {
  hour: string;
  minute: string;
  time: string;
}

function selectedNumber(selection: Selection) {
  if (selection === 'all') return undefined;
  const first = selection.values().next().value;
  return first === undefined ? undefined : Number(first);
}

function OptionColumn({
  format,
  label,
  onSelect,
  options,
  selected,
}: {
  format: (value: number) => string;
  label: string;
  onSelect: (value: number) => void;
  options: readonly number[];
  selected: number;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const list = listRef.current;
      const selectedItem = list?.querySelector<HTMLElement>('[data-selected]');

      if (!list || !selectedItem) return;

      list.scrollTop = selectedItem.offsetTop - (list.clientHeight - selectedItem.offsetHeight) / 2;
    });

    return () => cancelAnimationFrame(frame);
  }, [selected]);

  return (
    <div className="min-w-0 flex-1">
      <div className="mb-1.5 px-2 text-section-label uppercase text-content-muted">{label}</div>
      <ListBox
        ref={listRef}
        aria-label={label}
        className="max-h-64 overflow-y-auto rounded-control bg-surface-subtle p-1 outline-none"
        selectedKeys={new Set([String(selected)])}
        selectionMode="single"
        onSelectionChange={(selection: Selection) => {
          const next = selectedNumber(selection);
          if (next !== undefined) onSelect(next);
        }}
      >
        {options.map((option) => (
          <ListBoxItem
            key={option}
            id={String(option)}
            textValue={format(option)}
            className={({ isFocused, isHovered, isPressed, isSelected }: ListBoxItemRenderProps) =>
              cn(
                'flex h-control-height-compact cursor-pointer items-center justify-center rounded-control px-3 font-sans text-body-md text-content-secondary outline-none',
                (isHovered || isFocused) && 'bg-surface-hover text-content-primary',
                isPressed && 'bg-surface-selected',
                isSelected && 'bg-surface-selected font-semibold text-content-primary',
                isFocused && 'outline outline-2 outline-focus-ring outline-offset-[-2px]',
              )
            }
          >
            {format(option)}
          </ListBoxItem>
        ))}
      </ListBox>
    </div>
  );
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

export function TimeListSelector({
  hourCycle,
  labels,
  maxValue,
  minValue,
  minuteStep = 1,
  onChange,
  value,
}: TimeListSelectorProps) {
  const hourOptions = useMemo(
    () => createHourOptions(value, minValue, maxValue),
    [maxValue, minValue, value],
  );
  const minuteOptions = useMemo(
    () => createMinuteOptions(value, minuteStep, minValue, maxValue),
    [maxValue, minValue, minuteStep, value],
  );
  const selectedMinute = nearestMinuteOption(value, minuteStep, minValue, maxValue);

  return (
    <div aria-label={labels.time} className="flex min-w-64 gap-2" role="group">
      <OptionColumn
        format={(hour) => formatHour(hour, hourCycle)}
        label={labels.hour}
        options={hourOptions}
        selected={value.hour}
        onSelect={(hour) => onChange(withHour(value, hour, minValue, maxValue))}
      />
      <OptionColumn
        format={formatMinute}
        label={labels.minute}
        options={minuteOptions}
        selected={selectedMinute}
        onSelect={(minute) => onChange(withMinute(value, minute, minValue, maxValue))}
      />
    </div>
  );
}
