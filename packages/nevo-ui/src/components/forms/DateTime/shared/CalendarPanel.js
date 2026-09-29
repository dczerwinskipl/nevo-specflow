import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Button as AriaButton, Calendar, CalendarCell, CalendarGrid, CalendarGridBody, CalendarGridHeader, CalendarHeaderCell, Heading, RangeCalendar, } from 'react-aria-components';
import { fastColorTransitionClassName } from '../../../../design-system/interactionRecipes';
import { cn } from '../../../../lib';
import { iconButtonVariants } from '../../../actions/IconButton';
import { Icon } from '../../../foundations/Icon';
const calendarCellBaseClassName = `flex size-control-height-compact items-center justify-center rounded-control text-body-sm text-content-secondary outline-none data-[hovered]:bg-surface-hover data-[hovered]:text-content-primary data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[unavailable]:line-through data-[outside-month]:text-content-muted data-[outside-month]:opacity-40 data-[focus-visible]:outline data-[focus-visible]:outline-2 data-[focus-visible]:outline-focus-ring data-[today]:font-semibold ${fastColorTransitionClassName}`;
const singleCalendarCellClassName = cn(calendarCellBaseClassName, 'data-[selected]:bg-action-primary data-[selected]:text-content-on-primary');
const rangeCalendarCellClassName = cn(calendarCellBaseClassName, 'data-[selected]:bg-surface-selected data-[selected]:text-content-primary', 'data-[selection-start]:bg-action-primary data-[selection-start]:text-content-on-primary', 'data-[selection-end]:bg-action-primary data-[selection-end]:text-content-on-primary');
function CalendarHeader() {
    return (_jsxs("div", { className: "mb-2 flex items-center justify-between gap-2", children: [_jsx(AriaButton, { slot: "previous", className: iconButtonVariants({ variant: 'ghost', size: 'sm' }), children: _jsx(Icon, { name: "chevron-right", size: "sm", className: "rotate-180" }) }), _jsx(Heading, { className: "m-0 flex-1 text-center text-label-md text-content-primary" }), _jsx(AriaButton, { slot: "next", className: iconButtonVariants({ variant: 'ghost', size: 'sm' }), children: _jsx(Icon, { name: "chevron-right", size: "sm" }) })] }));
}
function CalendarGridContent({ range = false }) {
    const cellClassName = range ? rangeCalendarCellClassName : singleCalendarCellClassName;
    return (_jsxs(CalendarGrid, { className: "w-full border-separate border-spacing-1", children: [_jsx(CalendarGridHeader, { children: (day) => (_jsx(CalendarHeaderCell, { className: "pb-1 text-center text-label-sm text-content-muted", children: day })) }), _jsx(CalendarGridBody, { children: (date) => _jsx(CalendarCell, { date: date, className: cellClassName }) })] }));
}
export function DateCalendarPanel(props = {}) {
    return (_jsxs(Calendar, { ...props, className: "mx-auto w-full max-w-64 min-w-0", children: [_jsx(CalendarHeader, {}), _jsx(CalendarGridContent, {})] }));
}
export function DateRangeCalendarPanel(props = {}) {
    return (_jsxs(RangeCalendar, { ...props, className: "mx-auto w-full max-w-64 min-w-0", children: [_jsx(CalendarHeader, {}), _jsx(CalendarGridContent, { range: true })] }));
}
//# sourceMappingURL=CalendarPanel.js.map