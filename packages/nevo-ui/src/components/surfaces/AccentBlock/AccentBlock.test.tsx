import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AccentBlock } from './AccentBlock';

describe('AccentBlock semantics', () => {
  it('leaves region/announcement semantics to its consumer and forwards attributes', () => {
    const html = renderToStaticMarkup(
      <AccentBlock aria-labelledby="heading">
        <h2 id="heading">Requirements</h2>
      </AccentBlock>,
    );
    expect(html).toContain('aria-labelledby="heading"');
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain('role="status"');
  });

  it('keeps the card by default', () => {
    const html = renderToStaticMarkup(<AccentBlock>Now</AccentBlock>);
    expect(html).toContain('p-4');
    expect(html).not.toContain('app-body-padding-inline');
    expect(html).not.toContain('data-accent-bleed');
  });

  it('bleeds across the body padding from the body variable, never a copied length', () => {
    const html = renderToStaticMarkup(<AccentBlock bleed>Now</AccentBlock>);
    expect(html).toContain('data-accent-bleed="true"');
    expect(html).toContain('-mx-(--app-body-padding-inline)');
    expect(html).toContain('pr-(--app-body-padding-inline)');
    // The 3 px bar sits at the sheet edge; the text lines up with the page gutter.
    expect(html).toContain('pl-[calc(var(--app-body-padding-inline)_-_3px)]');
    expect(html).not.toMatch(/16px|-mx-4\b/);
    expect(html).not.toContain('@max-[40rem]');
  });

  it('bleeds only below a 40rem page content container with bleed="narrow"', () => {
    const html = renderToStaticMarkup(<AccentBlock bleed="narrow">Now</AccentBlock>);
    expect(html).toContain('data-accent-bleed="narrow"');
    expect(html).toContain('@max-[40rem]/app-content:-mx-(--app-body-padding-inline)');
    expect(html).toContain(
      '@max-[40rem]/app-content:pl-[calc(var(--app-body-padding-inline)_-_3px)]',
    );
    expect(html).not.toMatch(/(^|\s)-mx-\(/);
  });
});
