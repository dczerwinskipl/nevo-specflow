import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Checkbox, CheckboxField } from './Checkbox';

describe('Checkbox', () => {
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
});

