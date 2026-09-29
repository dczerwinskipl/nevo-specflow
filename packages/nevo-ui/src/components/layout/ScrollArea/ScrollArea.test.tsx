import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ScrollArea, readScrollAreaEdges } from './ScrollArea';

function rect(left: number, right: number, top = 0, bottom = 100) {
  return { left, right, top, bottom, width: right - left, height: bottom - top } as DOMRect;
}

describe('ScrollArea', () => {
  it('renders supplemental edge indicators outside the scroll viewport', () => {
    const markup = renderToStaticMarkup(
      <ScrollArea direction="horizontal">
        <div>Wide content</div>
      </ScrollArea>,
    );

    expect(markup).toContain('scroll-area-viewport');
    expect(markup).toContain('scroll-area-indicator-left');
    expect(markup).toContain('aria-hidden="true"');
  });

  it('reports physical horizontal continuation without relying on scrollLeft direction', () => {
    const viewport = {
      clientHeight: 100,
      clientWidth: 200,
      scrollHeight: 100,
      scrollTop: 0,
      scrollWidth: 500,
      getBoundingClientRect: () => rect(0, 200),
    };

    expect(
      readScrollAreaEdges(
        viewport,
        { getBoundingClientRect: () => rect(0, 200), scrollWidth: 500 },
        'horizontal',
      ),
    ).toEqual({ left: false, right: true, top: false, bottom: false });
    expect(
      readScrollAreaEdges(
        viewport,
        { getBoundingClientRect: () => rect(-150, 50), scrollWidth: 500 },
        'horizontal',
      ),
    ).toEqual({ left: true, right: true, top: false, bottom: false });
    expect(
      readScrollAreaEdges(
        viewport,
        { getBoundingClientRect: () => rect(-300, -100), scrollWidth: 500 },
        'horizontal',
      ),
    ).toEqual({ left: true, right: false, top: false, bottom: false });
  });

  it('reports vertical continuation and tolerates fractional terminal offsets', () => {
    const viewport = {
      clientHeight: 200,
      clientWidth: 100,
      scrollHeight: 500,
      scrollTop: 299.5,
      scrollWidth: 100,
      getBoundingClientRect: () => rect(0, 100, 0, 200),
    };

    expect(
      readScrollAreaEdges(
        viewport,
        { getBoundingClientRect: () => rect(0, 100, -299.5, 200.5), scrollWidth: 100 },
        'vertical',
      ),
    ).toEqual({ left: false, right: false, top: true, bottom: false });
  });

  it('reports physical edges for right-to-left content', () => {
    const viewport = {
      clientHeight: 100,
      clientWidth: 200,
      scrollHeight: 100,
      scrollTop: 0,
      scrollWidth: 500,
      getBoundingClientRect: () => rect(0, 200),
    };

    expect(
      readScrollAreaEdges(
        viewport,
        { getBoundingClientRect: () => rect(0, 200), scrollWidth: 500 },
        'horizontal',
        0.5,
        true,
      ),
    ).toEqual({ left: true, right: false, top: false, bottom: false });
    expect(
      readScrollAreaEdges(
        viewport,
        { getBoundingClientRect: () => rect(150, 350), scrollWidth: 500 },
        'horizontal',
        0.5,
        true,
      ),
    ).toEqual({ left: true, right: true, top: false, bottom: false });
    expect(
      readScrollAreaEdges(
        viewport,
        { getBoundingClientRect: () => rect(300, 500), scrollWidth: 500 },
        'horizontal',
        0.5,
        true,
      ),
    ).toEqual({ left: false, right: true, top: false, bottom: false });
  });
});
