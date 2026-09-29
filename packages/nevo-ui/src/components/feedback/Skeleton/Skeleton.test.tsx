import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Skeleton } from './Skeleton';
describe('Skeleton', () => {
  it('is hidden from assistive tech', () =>
    expect(renderToStaticMarkup(<Skeleton />)).toContain('aria-hidden="true"'));
});

