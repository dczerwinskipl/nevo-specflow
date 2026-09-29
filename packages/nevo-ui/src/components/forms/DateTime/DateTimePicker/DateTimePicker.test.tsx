import { parseZonedDateTime } from '@internationalized/date';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DateTimePicker } from './DateTimePicker';

describe('DateTimePicker', () => {
  it('keeps the supplied ZonedDateTime timezone', () => {
    const value = parseZonedDateTime('2026-09-15T12:30[Europe/Warsaw]');
    const markup = renderToStaticMarkup(<DateTimePicker aria-label="Starts at" value={value} />);

    expect(markup).toContain('data-design-slot="control"');
  });
});
