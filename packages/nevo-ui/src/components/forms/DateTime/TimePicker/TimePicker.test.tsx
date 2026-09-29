import { Time } from '@internationalized/date';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TimePicker } from './TimePicker';

describe('TimePicker', () => {
  it('renders minute-granularity field and picker trigger', () => {
    const markup = renderToStaticMarkup(
      <TimePicker aria-label="Start time" defaultValue={new Time(9, 30)} />,
    );

    expect(markup).toContain('aria-label="Choose time"');
    expect(markup).toContain('data-design-slot="control"');
  });

  it('does not expose a picker trigger when read-only', () => {
    const markup = renderToStaticMarkup(
      <TimePicker aria-label="Start time" defaultValue={new Time(9, 30)} readOnly />,
    );

    expect(markup).not.toContain('aria-label="Choose time"');
  });
});

