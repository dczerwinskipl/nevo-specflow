import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { IconButton } from './IconButton';

describe('IconButton', () => {
  it('keeps its accessible name at the usage site', () => {
    const markup = renderToStaticMarkup(<IconButton aria-label="Add record" icon="plus" />);
    expect(markup).toContain('aria-label="Add record"');
    expect(markup).toContain('type="button"');
    expect(markup).toContain('aria-hidden="true"');
  });
});
