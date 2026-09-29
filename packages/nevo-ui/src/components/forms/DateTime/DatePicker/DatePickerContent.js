import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { DateCalendarPanel } from '../shared/CalendarPanel';
import { PickerActions } from '../shared/PickerActions';
export function DatePickerContent({ labels, maxValue, minValue, onCancel, onDone, presentation, }) {
    return (_jsxs("div", { className: presentation === 'mobile' ? 'mx-auto grid w-full max-w-64 min-w-0 gap-4' : 'grid gap-3 p-3', children: [_jsx(DateCalendarPanel, { maxValue: maxValue, minValue: minValue }), _jsx(PickerActions, { labels: labels, onCancel: onCancel, onDone: onDone })] }));
}
//# sourceMappingURL=DatePickerContent.js.map