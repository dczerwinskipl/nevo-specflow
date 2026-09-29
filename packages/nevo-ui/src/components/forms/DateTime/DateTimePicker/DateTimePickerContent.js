import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { isSameDay, now, Time } from '@internationalized/date';
import { useContext, useState } from 'react';
import { DatePickerStateContext } from 'react-aria-components';
import { SegmentedControl } from '../../SegmentedControl';
import { DateCalendarPanel } from '../shared/CalendarPanel';
import { PickerActions } from '../shared/PickerActions';
import { TimeSelector } from '../shared/TimeSelector';
import { minuteStepDelta } from '../shared/TimeSelector.model';
function timeOf(value) {
    return new Time(value.hour, value.minute);
}
function minuteOfDay(value) {
    return value.hour * 60 + value.minute;
}
function ceilBoundaryToStep(value, minuteStep) {
    const minutes = minuteOfDay(value);
    const remainder = minutes % minuteStep;
    const hasSubMinuteValue = value.second !== 0 || value.millisecond !== 0;
    const delta = remainder === 0 && !hasSubMinuteValue
        ? 0
        : remainder === 0
            ? minuteStep
            : minuteStep - remainder;
    return value.set({ second: 0, millisecond: 0 }).add({ minutes: delta });
}
function floorBoundaryToStep(value, minuteStep) {
    const minutes = minuteOfDay(value);
    const remainder = minutes % minuteStep;
    return value.set({ second: 0, millisecond: 0 }).subtract({ minutes: remainder });
}
export function DateTimePickerContent({ fallbackValue, hourCycle, labels, maxValue, minValue, minuteStep = 1, onCancel, onDone, presentation, }) {
    const state = useContext(DatePickerStateContext);
    const [mobileStep, setMobileStep] = useState('date');
    const currentValue = state?.value ?? fallbackValue;
    const time = timeOf(currentValue);
    const timeMin = minValue && isSameDay(currentValue, minValue) ? timeOf(minValue) : null;
    const timeMax = maxValue && isSameDay(currentValue, maxValue) ? timeOf(maxValue) : null;
    const setTime = (nextTime) => {
        state?.setValue(currentValue.set({
            hour: nextTime.hour,
            minute: nextTime.minute,
            second: 0,
            millisecond: 0,
        }));
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
        if (presentation === 'mobile')
            setMobileStep('time');
    };
    if (presentation === 'mobile') {
        return (_jsxs("div", { className: "mx-auto grid w-full max-w-xs min-w-0 gap-4", children: [_jsxs(SegmentedControl, { "aria-label": labels.dialog, className: "w-full", value: mobileStep, onValueChange: (value) => setMobileStep(value), children: [_jsx(SegmentedControl.Item, { value: "date", children: labels.date }), _jsx(SegmentedControl.Item, { value: "time", children: labels.time })] }), mobileStep === 'date' ? (_jsx(DateCalendarPanel, {})) : (_jsx(TimeSelector, { hourCycle: hourCycle, labels: labels, maxValue: timeMax, minValue: timeMin, minuteStep: minuteStep, presentation: "mobile", value: time, onChange: setTime })), _jsx(PickerActions, { labels: labels, onCancel: onCancel, onDone: onDone, onNow: useCurrentTime })] }));
    }
    return (_jsxs("div", { className: "grid gap-3 p-3", children: [_jsxs("div", { className: "grid grid-cols-[auto_16rem] gap-4", children: [_jsx(DateCalendarPanel, {}), _jsx("div", { className: "border-l border-border-subtle pl-4", children: _jsx(TimeSelector, { hourCycle: hourCycle, labels: labels, maxValue: timeMax, minValue: timeMin, minuteStep: minuteStep, presentation: "desktop", value: time, onChange: setTime }) })] }), _jsx(PickerActions, { labels: labels, onCancel: onCancel, onDone: onDone, onNow: useCurrentTime })] }));
}
//# sourceMappingURL=DateTimePickerContent.js.map