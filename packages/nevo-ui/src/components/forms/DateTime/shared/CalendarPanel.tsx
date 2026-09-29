import type { CalendarDate } from '@internationalized/date';
import {
  Button as AriaButton,
  Calendar,
  CalendarCell,
  CalendarGrid,
  CalendarGridBody,
  CalendarGridHeader,
  CalendarHeaderCell,
  Heading,
  RangeCalendar,
  type CalendarProps,
  type RangeCalendarProps,
} from 'react-aria-components';
import { fastColorTransitionClassName } from '../../../../design-system/interactionRecipes';
import { cn } from '../../../../lib';
import { iconButtonVariants } from '../../../actions/IconButton';
import { Icon } from '../../../foundations/Icon';

const calendarCellBaseClassName = `flex size-control-height-compact items-center justify-center rounded-control text-body-sm text-content-secondary outline-none data-[hovered]:bg-surface-hover data-[hovered]:text-content-primary data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[unavailable]:line-through data-[outside-month]:text-content-muted data-[outside-month]:opacity-40 data-[focus-visible]:outline data-[focus-visible]:outline-2 data-[focus-visible]:outline-focus-ring data-[today]:font-semibold ${fastColorTransitionClassName}`;

const singleCalendarCellClassName = cn(
  calendarCellBaseClassName,
  'data-[selected]:bg-action-primary data-[selected]:text-content-on-primary',
);

const rangeCalendarCellClassName = cn(
  calendarCellBaseClassName,
  'data-[selected]:bg-surface-selected data-[selected]:text-content-primary',
  'data-[selection-start]:bg-action-primary data-[selection-start]:text-content-on-primary',
  'data-[selection-end]:bg-action-primary data-[selection-end]:text-content-on-primary',
);

function CalendarHeader() {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <AriaButton slot="previous" className={iconButtonVariants({ variant: 'ghost', size: 'sm' })}>
        <Icon name="chevron-right" size="sm" className="rotate-180" />
      </AriaButton>
      <Heading className="m-0 flex-1 text-center text-label-md text-content-primary" />
      <AriaButton slot="next" className={iconButtonVariants({ variant: 'ghost', size: 'sm' })}>
        <Icon name="chevron-right" size="sm" />
      </AriaButton>
    </div>
  );
}

function CalendarGridContent({ range = false }: { range?: boolean }) {
  const cellClassName = range ? rangeCalendarCellClassName : singleCalendarCellClassName;

  return (
    <CalendarGrid className="w-full border-separate border-spacing-1">
      <CalendarGridHeader>
        {(day) => (
          <CalendarHeaderCell className="pb-1 text-center text-label-sm text-content-muted">
            {day}
          </CalendarHeaderCell>
        )}
      </CalendarGridHeader>
      <CalendarGridBody>
        {(date) => <CalendarCell date={date} className={cellClassName} />}
      </CalendarGridBody>
    </CalendarGrid>
  );
}

export type DateCalendarPanelProps = Omit<CalendarProps<CalendarDate>, 'children' | 'className'>;

export function DateCalendarPanel(props: DateCalendarPanelProps = {}) {
  return (
    <Calendar {...props} className="mx-auto w-full max-w-64 min-w-0">
      <CalendarHeader />
      <CalendarGridContent />
    </Calendar>
  );
}

export type DateRangeCalendarPanelProps = Omit<
  RangeCalendarProps<CalendarDate>,
  'children' | 'className'
>;

export function DateRangeCalendarPanel(props: DateRangeCalendarPanelProps = {}) {
  return (
    <RangeCalendar {...props} className="mx-auto w-full max-w-64 min-w-0">
      <CalendarHeader />
      <CalendarGridContent range />
    </RangeCalendar>
  );
}

