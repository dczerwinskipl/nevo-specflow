import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Time } from '@internationalized/date';
import { useEffect, useMemo, useRef } from 'react';
import { ListBox, ListBoxItem } from 'react-aria-components';
import { cn } from '../../../../lib';
import { createHourOptions, createMinuteOptions, formatHour, formatMinute, nearestMinuteOption, withHour, withMinute, } from './TimeSelector.model';
function selectedNumber(selection) {
    if (selection === 'all')
        return undefined;
    const first = selection.values().next().value;
    return first === undefined ? undefined : Number(first);
}
function OptionColumn({ format, label, onSelect, options, selected, }) {
    const listRef = useRef(null);
    useEffect(() => {
        const frame = requestAnimationFrame(() => {
            const list = listRef.current;
            const selectedItem = list?.querySelector('[data-selected]');
            if (!list || !selectedItem)
                return;
            list.scrollTop = selectedItem.offsetTop - (list.clientHeight - selectedItem.offsetHeight) / 2;
        });
        return () => cancelAnimationFrame(frame);
    }, [selected]);
    return (_jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("div", { className: "mb-1.5 px-2 text-section-label uppercase text-content-muted", children: label }), _jsx(ListBox, { ref: listRef, "aria-label": label, className: "max-h-64 overflow-y-auto rounded-control bg-surface-subtle p-1 outline-none", selectedKeys: new Set([String(selected)]), selectionMode: "single", onSelectionChange: (selection) => {
                    const next = selectedNumber(selection);
                    if (next !== undefined)
                        onSelect(next);
                }, children: options.map((option) => (_jsx(ListBoxItem, { id: String(option), textValue: format(option), className: ({ isFocused, isHovered, isPressed, isSelected }) => cn('flex h-control-height-compact cursor-pointer items-center justify-center rounded-control px-3 font-sans text-body-md text-content-secondary outline-none', (isHovered || isFocused) && 'bg-surface-hover text-content-primary', isPressed && 'bg-surface-selected', isSelected && 'bg-surface-selected font-semibold text-content-primary', isFocused && 'outline outline-2 outline-focus-ring outline-offset-[-2px]'), children: format(option) }, option))) })] }));
}
export function TimeListSelector({ hourCycle, labels, maxValue, minValue, minuteStep = 1, onChange, value, }) {
    const hourOptions = useMemo(() => createHourOptions(value, minValue, maxValue), [maxValue, minValue, value]);
    const minuteOptions = useMemo(() => createMinuteOptions(value, minuteStep, minValue, maxValue), [maxValue, minValue, minuteStep, value]);
    const selectedMinute = nearestMinuteOption(value, minuteStep, minValue, maxValue);
    return (_jsxs("div", { "aria-label": labels.time, className: "flex min-w-64 gap-2", role: "group", children: [_jsx(OptionColumn, { format: (hour) => formatHour(hour, hourCycle), label: labels.hour, options: hourOptions, selected: value.hour, onSelect: (hour) => onChange(withHour(value, hour, minValue, maxValue)) }), _jsx(OptionColumn, { format: formatMinute, label: labels.minute, options: minuteOptions, selected: selectedMinute, onSelect: (minute) => onChange(withMinute(value, minute, minValue, maxValue)) })] }));
}
//# sourceMappingURL=TimeListSelector.js.map