import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Button, buttonVariants } from './Button';

describe('Button', () => {
  it('uses native button and disabled semantics', () => {
    expect(renderToStaticMarkup(<Button>Save</Button>)).toContain('type="button"');
    expect(renderToStaticMarkup(<Button type="submit">Save</Button>)).toContain('type="submit"');
    expect(renderToStaticMarkup(<Button disabled>Save</Button>)).toContain('disabled=""');
  });

  it('owns explicit content and full-width layout variants without hiding label content', () => {
    expect(renderToStaticMarkup(<Button>Save</Button>)).toContain('w-fit');

    const full = renderToStaticMarkup(
      <Button width="full">Northwind Workforce Identity EU</Button>,
    );
    expect(full).toContain('w-full');
    expect(full).not.toContain('w-fit');
    expect(full).not.toContain('truncate');
    expect(full).toContain('Northwind Workforce Identity EU');
  });
});

describe('Button label overflow', () => {
  it('wraps by default and keeps one line at the control height', () => {
    const markup = renderToStaticMarkup(<Button>Save</Button>);
    expect(markup).not.toContain('whitespace-nowrap');
    expect(markup).toContain('max-w-full');
    expect(markup).toContain('min-h-control-height-default');
    expect(markup).toContain('break-words');
    expect(markup).not.toMatch(/ h-control-height/);
  });

  it('derives the single-line vertical padding from the control height and label line', () => {
    expect(buttonVariants({ size: 'md' })).toContain(
      'py-[calc((var(--spacing-control-height-default)_-_2px_-_var(--text-label-md--line-height))/2)]',
    );
    expect(buttonVariants({ size: 'sm' })).toContain(
      'py-[calc((var(--spacing-control-height-compact)_-_2px_-_var(--text-label-sm--line-height))/2)]',
    );
  });

  it('truncates on one line only when asked', () => {
    const markup = renderToStaticMarkup(<Button labelOverflow="truncate">Long label</Button>);
    expect(markup).toContain('whitespace-nowrap');
    expect(markup).toContain('min-w-0');
    expect(markup).toContain('truncate');
  });

  it('keeps the legacy single line with nowrap', () => {
    const markup = renderToStaticMarkup(<Button labelOverflow="nowrap">Long label</Button>);
    expect(markup).toContain('whitespace-nowrap');
    expect(markup).not.toContain('truncate');
  });
});
