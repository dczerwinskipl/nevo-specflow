import { renderToStaticMarkup } from 'react-dom/server';
import { AlarmClock } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { iconAssetRef } from '../../../design-system/resources';
import { Icon } from './Icon';
import { IconButton } from '../../actions/IconButton';

describe('Icon', () => {
  it('renders any statically imported Lucide icon with DS accessibility and sizing', () => {
    const markup = renderToStaticMarkup(
      <Icon aria-label="Schedule" decorative={false} name={AlarmClock} />,
    );
    expect(markup).toContain('<svg');
    expect(markup).toContain('aria-label="Schedule"');
    expect(markup).toContain('size-icon-md');
    const button = renderToStaticMarkup(<IconButton aria-label="Schedule" icon={AlarmClock} />);
    expect(button).toContain('aria-label="Schedule"');
    expect(button).toContain('<svg');
  });

  it('renders the registered Save glyph with its design resource identity', () => {
    const markup = renderToStaticMarkup(<Icon name="save" />);
    expect(markup).toContain('<svg');
    expect(markup).toContain('aria-hidden="true"');
    expect(iconAssetRef('save', 'md')).toBe('Icon/save/md');
  });

  it('registers the list glyph (a table of contents) with its design resource identity', () => {
    const markup = renderToStaticMarkup(<Icon name="list" />);
    expect(markup).toContain('<svg');
    expect(iconAssetRef('list', 'md')).toBe('Icon/list/md');
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
