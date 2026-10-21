import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Skeleton } from './Skeleton';
describe('Skeleton', () => {
  it('is hidden from assistive tech', () =>
    expect(renderToStaticMarkup(<Skeleton />)).toContain('aria-hidden="true"'));

  it('pulses by default and honours reduced motion', () => {
    const markup = renderToStaticMarkup(<Skeleton />);
    expect(markup).toContain('animate-pulse motion-reduce:animate-none');
    expect(markup).toContain('data-animated="true"');
  });

  it('renders a static placeholder when animated is false', () => {
    const markup = renderToStaticMarkup(<Skeleton animated={false} className="h-4" />);
    expect(markup).not.toContain('animate-pulse');
    expect(markup).not.toContain('style=');
    expect(markup).toContain('data-animated="false"');
    expect(markup).toContain('rounded-control bg-surface-selected h-4');
  });
});
