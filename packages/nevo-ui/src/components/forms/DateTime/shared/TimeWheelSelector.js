import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Time } from '@internationalized/date';
import { useMemo } from 'react';
import { ListBox, ListBoxItem } from 'react-aria-components';
import { cn } from '../../../../lib';
import { createHourOptions, createMinuteOptions, formatHour, formatMinute, nearestMinuteOption, withHour, withMinute, } from './TimeSelector.model';
import { useWheelColumnScroll } from './useWheelColumnScroll';
const wheelItemHeight = 40;
const visibleWheelItems = 5;
const wheelHeight = wheelItemHeight * visibleWheelItems;
const wheelPadding = wheelItemHeight * Math.floor(visibleWheelItems / 2);
const settleDelayMs = 140;
const wheelViewportStyle = {
    height: wheelHeight,
    WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 24%, black 76%, transparent 100%)',
    maskImage: 'linear-gradient(to bottom, transparent 0%, black 24%, black 76%, transparent 100%)',
};
const wheelItemStyle = {
    height: wheelItemHeight,
};
const selectionBandStyle = {
    height: wheelItemHeight,
};
function WheelColumn({ ariaLabel, format, onSelect, options, selected, }) {
    const scrollSync = useWheelColumnScroll({
        itemHeight: wheelItemHeight,
        onSelect,
        options,
        selected,
        settleDelayMs,
    });
    return (_jsx(ListBox, { ref: scrollSync.listRef, "aria-label": ariaLabel, className: "relative z-20 h-full min-w-0 cursor-grab snap-y snap-mandatory overflow-y-auto px-2 outline-none active:cursor-grabbing [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", selectedKeys: new Set([String(selected)]), selectionMode: "single", style: { paddingBlock: wheelPadding }, onScroll: scrollSync.onScroll, onSelectionChange: scrollSync.onSelectionChange, children: options.map((option) => (_jsx(ListBoxItem, { id: String(option), textValue: format(option), style: wheelItemStyle, className: ({ isFocused }) => cn('flex cursor-pointer snap-center items-center justify-center rounded-control px-2 font-sans text-body-lg text-content-primary outline-none', isFocused && 'outline outline-2 outline-focus-ring outline-offset-[-2px]'), children: format(option) }, option))) }));
}
export function TimeWheelSelector({ hourCycle, labels, maxValue, minValue, minuteStep = 1, onChange, value, }) {
    const hourOptions = useMemo(() => createHourOptions(value, minValue, maxValue), [maxValue, minValue, value]);
    const minuteOptions = useMemo(() => createMinuteOptions(value, minuteStep, minValue, maxValue), [maxValue, minValue, minuteStep, value]);
    const minuteSelection = nearestMinuteOption(value, minuteStep, minValue, maxValue);
    return (_jsxs("div", { "aria-label": labels.time, className: "grid min-w-0 gap-2", role: "group", children: [_jsxs("div", { className: "grid grid-cols-2 text-center text-section-label uppercase tracking-[0.12em] text-content-muted", children: [_jsx("span", { children: labels.hour }), _jsx("span", { children: labels.minute })] }), _jsxs("div", { className: "relative grid min-w-0 grid-cols-2 overflow-hidden", style: wheelViewportStyle, children: [_jsx("div", { "aria-hidden": "true", className: "pointer-events-none absolute inset-x-0 top-1/2 z-10 -translate-y-1/2 rounded-control bg-surface-selected", style: selectionBandStyle }), _jsx(WheelColumn, { ariaLabel: labels.hour, format: (hour) => formatHour(hour, hourCycle), options: hourOptions, selected: value.hour, onSelect: (hour) => onChange(withHour(value, hour, minValue, maxValue)) }), _jsx(WheelColumn, { ariaLabel: labels.minute, format: formatMinute, options: minuteOptions, selected: minuteSelection, onSelect: (minute) => onChange(withMinute(value, minute, minValue, maxValue)) })] })] }));
}
//# sourceMappingURL=TimeWheelSelector.js.map