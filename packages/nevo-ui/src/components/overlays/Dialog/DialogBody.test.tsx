// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DialogBody } from './Dialog';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** jsdom has no layout: the body's scroll geometry is given per test. */
function geometry(element: HTMLElement, scrollHeight: () => number) {
  Object.defineProperty(element, 'clientHeight', { configurable: true, value: 200 });
  Object.defineProperty(element, 'scrollHeight', { configurable: true, get: scrollHeight });
}

describe('DialogBody "more below" edge', () => {
  it('works without ResizeObserver and follows replaced content', async () => {
    expect(typeof ResizeObserver).toBe('undefined');
    let height = 100;
    const view = render(
      <DialogBody data-testid="body">
        <p>Short</p>
      </DialogBody>,
    );
    const body = view.getByTestId('body');
    geometry(body, () => height);
    expect(body.hasAttribute('data-more')).toBe(false);
    // The content is replaced by a taller one: the edge appears without any scroll or resize event.
    height = 900;
    view.rerender(
      <DialogBody data-testid="body">
        <ul>
          <li>Long</li>
        </ul>
      </DialogBody>,
    );
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(body.getAttribute('data-more')).toBe('true');
    // Scrolled to the end, the edge goes.
    Object.defineProperty(body, 'scrollTop', { configurable: true, value: 700 });
    act(() => void body.dispatchEvent(new Event('scroll')));
    expect(body.hasAttribute('data-more')).toBe(false);
  });

  it('disconnects its observers and listener when it unmounts', () => {
    const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect');
    const view = render(<DialogBody data-testid="body">Text</DialogBody>);
    const remove = vi.spyOn(view.getByTestId('body'), 'removeEventListener');
    view.unmount();
    expect(disconnect).toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith('scroll', expect.any(Function));
  });
});
