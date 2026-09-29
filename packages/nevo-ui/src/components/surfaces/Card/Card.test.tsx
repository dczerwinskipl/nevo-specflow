import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Card } from './Card';

describe('Card', () => {
  it('uses one shared surface and gap-based anatomy', () => {
    const markup = renderToStaticMarkup(
      <Card>
        <Card.Header>Header</Card.Header>
        <Card.Body>Body</Card.Body>
        <Card.Footer>Footer</Card.Footer>
      </Card>,
    );
    expect(markup).toContain('grid gap-4');
    expect(markup).toContain('data-design-slot="header"');
    expect(markup).toContain('data-design-slot="body"');
    expect(markup).toContain('data-design-slot="footer"');
  });
});

