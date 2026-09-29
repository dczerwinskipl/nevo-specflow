import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Collapsible } from './Collapsible';

describe('Collapsible', () => {
  it('renders an expanded React Aria disclosure contract', () => {
    const html = renderToStaticMarkup(
      <Collapsible isExpanded>
        <Collapsible.Trigger>Details</Collapsible.Trigger>
        <Collapsible.Content>Content</Collapsible.Content>
      </Collapsible>,
    );

    expect(html).toContain('data-expanded');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('Content');
  });

  it('renders the collapsed state without product semantics', () => {
    const html = renderToStaticMarkup(
      <Collapsible isExpanded={false}>
        <Collapsible.Trigger>Details</Collapsible.Trigger>
        <Collapsible.Content>Content</Collapsible.Content>
      </Collapsible>,
    );

    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('data-expanded=""');
  });
});

