import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DesignMetadataProvider } from '@nevo/figma-capture/metadata';

import { DatePicker } from './DatePicker';
import { DateRangePicker } from './DateRangePicker';
import { DateTimePicker } from './DateTimePicker';
import { TimePicker } from './TimePicker';

const controls = [
  ['DatePicker', DatePicker],
  ['DateRangePicker', DateRangePicker],
  ['DateTimePicker', DateTimePicker],
  ['TimePicker', TimePicker],
] as const;

describe('date/time invalid-state contract', () => {
  it.each(['grammar', 'spelling', true, 'true'] as const)(
    'recognizes aria-invalid=%s across the date/time family',
    (ariaInvalid) => {
      for (const [component, Control] of controls) {
        const html = renderToStaticMarkup(
          <DesignMetadataProvider>
            <Control aria-label={component} aria-invalid={ariaInvalid} />
          </DesignMetadataProvider>,
        );

        expect(html).toContain('data-design-prop-state="invalid"');
      }
    },
  );

  it.each([false, 'false', undefined] as const)(
    'does not treat aria-invalid=%s as invalid',
    (ariaInvalid) => {
      for (const [component, Control] of controls) {
        const html = renderToStaticMarkup(
          <DesignMetadataProvider>
            <Control aria-label={component} aria-invalid={ariaInvalid} />
          </DesignMetadataProvider>,
        );

        expect(html).toContain('data-design-prop-state="default"');
      }
    },
  );
});
