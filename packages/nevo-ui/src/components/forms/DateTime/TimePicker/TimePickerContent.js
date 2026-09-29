import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Time } from '@internationalized/date';
import { PickerActions } from '../shared/PickerActions';
import { TimeSelector } from '../shared/TimeSelector';
import { snapTimeToMinuteStep } from '../shared/TimeSelector.model';
export function TimePickerContent({ hourCycle, labels, maxValue, minValue, minuteStep = 1, onCancel, onChange, onDone, presentation, value, }) {
    const useCurrentTime = () => {
        const current = new Date();
        onChange(snapTimeToMinuteStep(new Time(current.getHours(), current.getMinutes()), minuteStep, minValue, maxValue));
    };
    return (_jsxs("div", { className: presentation === 'mobile'
            ? 'mx-auto grid w-full max-w-xs min-w-0 gap-4'
            : 'grid min-w-72 gap-3 p-3', children: [_jsx(TimeSelector, { hourCycle: hourCycle, labels: labels, maxValue: maxValue, minValue: minValue, minuteStep: minuteStep, presentation: presentation, value: value, onChange: onChange }), _jsx(PickerActions, { labels: labels, onCancel: onCancel, onDone: onDone, onNow: useCurrentTime })] }));
}
//# sourceMappingURL=TimePickerContent.js.map