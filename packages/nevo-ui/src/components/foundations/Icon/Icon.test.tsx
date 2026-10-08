import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { iconAssetRef } from '../../../design-system/resources';
import { Icon } from './Icon';

describe('Icon', () => {
  it('renders the registered Save glyph with its design resource identity', () => {
    const markup = renderToStaticMarkup(<Icon name="save" />);
    expect(markup).toContain('<svg');
    expect(markup).toContain('aria-hidden="true"');
    expect(iconAssetRef('save', 'md')).toBe('Icon/save/md');
  });


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
