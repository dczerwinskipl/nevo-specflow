import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Spinner } from './Spinner';
describe('Spinner', () => {
  it('becomes a status when labelled', () =>
    expect(renderToStaticMarkup(<Spinner label="Loading" />)).toContain('role="status"'));
});

