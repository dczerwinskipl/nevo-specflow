import type { CalendarDate } from '@internationalized/date';
import { type CalendarProps, type RangeCalendarProps } from 'react-aria-components';
export type DateCalendarPanelProps = Omit<CalendarProps<CalendarDate>, 'children' | 'className'>;
export declare function DateCalendarPanel(props?: DateCalendarPanelProps): import("react/jsx-runtime").JSX.Element;
export type DateRangeCalendarPanelProps = Omit<RangeCalendarProps<CalendarDate>, 'children' | 'className'>;
export declare function DateRangeCalendarPanel(props?: DateRangeCalendarPanelProps): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=CalendarPanel.d.ts.map