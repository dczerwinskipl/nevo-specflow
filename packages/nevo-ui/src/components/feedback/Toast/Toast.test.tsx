import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ToastProvider, ToastViewport } from './Toast';
describe('Toast', () => {
  it('renders a viewport host', () =>
    expect(
      renderToStaticMarkup(
        <ToastProvider>
          <ToastViewport />
        </ToastProvider>,
      ),
    ).toContain('ol'));
});

