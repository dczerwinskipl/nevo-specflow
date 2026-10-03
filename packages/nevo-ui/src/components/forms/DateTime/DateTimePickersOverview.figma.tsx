import { defineDesignComponent } from '@nevo/figma-core/authoring';

export const designSpec = defineDesignComponent({
  component: 'DateTimePickersOverview',
  description:
    'Design-only overview of open date/time picker surfaces. Closed controls remain the canonical DatePicker, DateRangePicker, TimePicker and DateTimePicker components.',
  order: 138,
  variants: {
    pattern: [
      'date-desktop',
      'date-mobile',
      'date-range-desktop',
      'date-range-mobile',
      'time-desktop',
      'time-mobile',
      'datetime-desktop',
      'datetime-mobile-date',
      'datetime-mobile-time',
    ],
  },
  defaults: { pattern: 'time-desktop' },
  slots: {
    surface: { kind: 'container' },
  },
});
