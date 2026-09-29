import { CalendarDate } from '@internationalized/date';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DatePicker } from './DatePicker';

describe('DatePicker', () => {
  it('keeps the closed control as the normal component capture', () => {
    const markup = renderToStaticMarkup(
      <DatePicker aria-label="Start date" defaultValue={new CalendarDate(2026, 9, 15)} />,
    );

    expect(markup).toContain('data-design-slot="control"');
  });

  it('supports localized dialog/action labels without changing the field contract', () => {
    const markup = renderToStaticMarkup(
      <DatePicker
        aria-label="Start date"
        labels={{ cancel: 'Anuluj', dialog: 'Wybierz datę', done: 'Gotowe' }}
      />,
    );

    expect(markup).toContain('data-design-slot="control"');
  });
});
