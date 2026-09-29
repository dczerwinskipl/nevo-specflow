import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Separator, separatorVariants } from './Separator';

describe('Separator', () => {
  it('exposes semantic orientation and owns no surrounding spacing', () => {
    const markup = renderToStaticMarkup(<Separator orientation="vertical" />);
    expect(markup).toContain('role="separator"');
    expect(markup).toContain('aria-orientation="vertical"');
    expect(separatorVariants({ orientation: 'horizontal' })).not.toContain(' m-');
  });
});

