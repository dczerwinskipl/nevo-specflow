import { CalendarDate } from '@internationalized/date';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DateRangePicker } from './DateRangePicker';

describe('DateRangePicker', () => {
  it('renders a date-only range control', () => {
    const markup = renderToStaticMarkup(
      <DateRangePicker
        aria-label="Window"
        defaultValue={{
          start: new CalendarDate(2026, 9, 15),
          end: new CalendarDate(2026, 9, 18),
        }}
      />,
    );

    expect(markup).toContain('data-design-slot="control"');
  });
});
