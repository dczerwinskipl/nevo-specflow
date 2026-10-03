import { describe, expect, it, vi } from 'vitest';
import {
  hasOverviewMatrixHeader,
  overviewCellDimensions,
  overviewText,
  reflowOverviewStack,
} from './overviews';

describe('component overview layout', () => {
  it('repositions every existing overview from its final height after an update', () => {
    const overviews = [
      { height: 100, x: 24, y: 24 },
      { height: 80, x: 24, y: 24 },
      { height: 120, x: 24, y: 72 },
    ];

    expect(reflowOverviewStack(overviews)).toBe(468);
    expect(overviews).toEqual([
      { height: 100, x: 24, y: 24 },
      { height: 80, x: 24, y: 172 },
      { height: 120, x: 24, y: 300 },
    ]);
  });

  it('omits the synthetic Default header for components without variant axes', () => {
    const axis = { name: 'state', values: ['default', 'disabled'] };

    expect(hasOverviewMatrixHeader()).toBe(false);
    expect(hasOverviewMatrixHeader(axis)).toBe(true);
    expect(hasOverviewMatrixHeader(undefined, axis)).toBe(true);
  });

  it('keeps large component previews at their intrinsic 1:1 dimensions', () => {
    const component = { width: 1400, height: 900 } as ComponentNode;

    expect(overviewCellDimensions([{ component, properties: {} }])).toEqual({
      width: 1432,
      height: 924,
    });
  });

  it('normalizes generated documentation text instead of inheriting editor formatting', () => {
    const node = {} as TextNode;
    vi.stubGlobal('figma', { createText: vi.fn(() => node) });

    overviewText(
      'Popover — overview',
      { family: 'Inter', style: 'Semi Bold' },
      24,
      { r: 1, g: 1, b: 1 },
      'strong',
    );

    expect(node).toMatchObject({
      textDecoration: 'NONE',
      textCase: 'ORIGINAL',
      textAlignHorizontal: 'LEFT',
      textAlignVertical: 'TOP',
      letterSpacing: { unit: 'PIXELS', value: 0 },
      lineHeight: { unit: 'AUTO' },
    });
    vi.unstubAllGlobals();
  });
});
