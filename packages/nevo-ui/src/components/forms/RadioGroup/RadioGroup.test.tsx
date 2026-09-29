import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RadioGroup, RadioGroupItem, RadioGroupOption } from './RadioGroup';

describe('RadioGroup', () => {
  it('renders radio semantics', () => {
    expect(
      renderToStaticMarkup(
        <RadioGroup defaultValue="a">
          <RadioGroupItem value="a" />
        </RadioGroup>,
      ),
    ).toContain('role="radiogroup"');
  });

  it('supports labeled options with descriptions', () => {
    const html = renderToStaticMarkup(
      <RadioGroup defaultValue="a">
        <RadioGroupOption value="a" label="Standard" description="Default processing." />
      </RadioGroup>,
    );
    expect(html).toContain('Standard');
    expect(html).toContain('Default processing.');
  });
});
