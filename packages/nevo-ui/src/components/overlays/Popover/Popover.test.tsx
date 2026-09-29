import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Popover, PopoverContent, PopoverTrigger } from './Popover';

describe('Popover', () => {
  it('keeps trigger composition available without wrapping consumer controls', () => {
    const markup = renderToStaticMarkup(
      <Popover>
        <PopoverTrigger asChild>
          <button type="button">Open</button>
        </PopoverTrigger>
        <PopoverContent forceMount>Details</PopoverContent>
      </Popover>,
    );
    expect(markup).toContain('<button type="button"');
    expect(markup).toContain('aria-expanded="false"');
  });
});
