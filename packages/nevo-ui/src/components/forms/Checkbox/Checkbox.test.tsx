import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Checkbox, CheckboxField } from './Checkbox';

describe('Checkbox', () => {
  it('owns a visible semantic keyboard focus treatment', () => {
    const html = renderToStaticMarkup(<Checkbox aria-label="Select" />);
    expect(html).toContain('focus-visible:outline-2');
    expect(html).toContain('focus-visible:outline-focus-ring');
  });
  it('exposes checkbox semantics', () => {
    expect(renderToStaticMarkup(<Checkbox aria-label="Select" checked />)).toContain(
      'role="checkbox"',
    );
  });

  it('supports a visible label and description without changing the primitive API', () => {
    const html = renderToStaticMarkup(
      <CheckboxField label="Include archived" description="Archived records are included." />,
    );
    expect(html).toContain('Include archived');
    expect(html).toContain('Archived records are included.');
  });

  it('merges consumer classes onto the control while keeping field layout classes', () => {
    const html = renderToStaticMarkup(
      <CheckboxField className="consumer-control" fieldClassName="consumer-field" label="Choice" />,
    );

    expect(html).toContain('consumer-field');
    expect(html).toContain('mt-0.5 consumer-control');
  });
  it('keeps a disabled description readable while the label shows the disabled role', () => {
    const html = renderToStaticMarkup(
      <CheckboxField disabled label="Unavailable" description="Reason stays readable." />,
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
