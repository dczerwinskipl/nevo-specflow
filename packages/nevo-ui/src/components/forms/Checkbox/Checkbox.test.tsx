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
});
