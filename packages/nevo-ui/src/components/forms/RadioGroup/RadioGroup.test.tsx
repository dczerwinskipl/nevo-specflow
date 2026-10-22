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

  it('merges consumer classes onto the item while keeping option layout classes', () => {
    const html = renderToStaticMarkup(
      <RadioGroup defaultValue="a">
        <RadioGroupOption
          className="consumer-control"
          label="Standard"
          optionClassName="consumer-option"
          value="a"
        />
      </RadioGroup>,
    );

    expect(html).toContain('consumer-option');
    expect(html).toContain('mt-0.5 consumer-control');
  });
  it('keeps a disabled description readable while the label shows the disabled role', () => {
    const html = renderToStaticMarkup(
      <RadioGroup>
        <RadioGroupOption
          value="b"
          disabled
          label="Unavailable"
          description="Reason stays readable."
        />
      </RadioGroup>,
    );
    const wrapper = /class="(flex items-start gap-2.5[^"]*)"/.exec(html)?.[1] ?? 'missing';
    expect(wrapper).not.toContain('opacity');
    expect(html).toMatch(/<label[^>]*class="[^"]*cursor-not-allowed text-content-muted/);
    expect(html).toMatch(
      /<div id="[^"]*-description" class="mt-0.5 text-body-sm text-content-muted">/,
    );
    expect(html).toContain('disabled:opacity-60');
  });
});
