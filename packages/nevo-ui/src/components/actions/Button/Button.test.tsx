import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Button } from './Button';

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
