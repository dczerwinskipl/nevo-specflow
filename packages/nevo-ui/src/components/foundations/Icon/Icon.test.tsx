import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Icon } from './Icon';

describe('Icon', () => {
  it('separates decorative and semantic icon accessibility', () => {
    const decorative = renderToStaticMarkup(<Icon name="branch" />);
    const semantic = renderToStaticMarkup(
      <Icon aria-label="Repository branch" decorative={false} name="branch" />,
    );
    expect(decorative).toContain('aria-hidden="true"');
    expect(decorative).not.toContain('aria-label');
    expect(semantic).toContain('aria-label="Repository branch"');
    expect(semantic).not.toContain('aria-hidden');
  });
});

