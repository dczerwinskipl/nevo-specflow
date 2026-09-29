import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Button } from './Button';

describe('Button', () => {
  it('uses native button and disabled semantics', () => {
    expect(renderToStaticMarkup(<Button>Save</Button>)).toContain('type="button"');
    expect(renderToStaticMarkup(<Button type="submit">Save</Button>)).toContain('type="submit"');
    expect(renderToStaticMarkup(<Button disabled>Save</Button>)).toContain('disabled=""');
  });
});
