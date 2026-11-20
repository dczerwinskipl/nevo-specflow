import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DesignMetadataProvider } from '@nevo/figma-capture/metadata';
import {
  Progress,
  normalizeProgressValue,
  fitsProgressSegments,
  progressPositionSegments,
  validProgressCounts,
  validProgressPosition,
} from './Progress';
import { designSpec } from './Progress.figma';

describe('Progress', () => {
  it.each([
    [104, 17, true],
    [104, 18, false],
    [112, 19, true],
    [112, 20, false],
    [688, 100, true],
    [51.99, 9, false],
    [52, 9, true],
  ])('uses the actual width boundary: %s px, %s segments', (width, total, fits) => {
    expect(fitsProgressSegments(width, total)).toBe(fits);
  });
  it('rejects inconsistent counts rather than clamping task facts', () => {
    for (const [completed, total] of [
      [1, 0],
      [3, 2],
      [-1, 2],
      [1.5, 2],
      [1, Infinity],
    ]) {
      expect(validProgressCounts(completed!, total!)).toBe(false);
    }

    expect(
      renderToStaticMarkup(
        <Progress aria-label="Invalid" variant="segmented" completed={3} total={2} />,
      ),
    ).toBe('');
  });
  it('preserves aggregate count accessibility through continuous fallback', () => {
    const html = renderToStaticMarkup(
      <Progress
        aria-label="Tasks"
        variant="segmented"
        completed={5}
        total={9}
        size="compact"
        aria-valuetext="5 of 9 tasks"
      />,
    );
    expect(html).toContain('aria-valuemax="9"');
    expect(html).toContain('aria-valuenow="5"');
    expect(html).toContain('aria-valuetext="5 of 9 tasks"');
  });
  it('clamps values and supports a custom max', () => {
    expect(normalizeProgressValue(150, 100)).toEqual({
      max: 100,
      value: 100,
      percentage: 100,
    });
    expect(normalizeProgressValue(25, 50)).toEqual({
      max: 50,
      value: 25,
      percentage: 50,
    });
  });

  it('renders standard progressbar semantics', () => {
    const html = renderToStaticMarkup(<Progress aria-label="Import progress" max={20} value={5} />);

    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuemin="0"');
    expect(html).toContain('aria-valuemax="20"');
    expect(html).toContain('aria-valuenow="5"');
    expect(html).toContain('width:25%');
  });

  it('captures fill as nested structure without public slots', () => {
    const html = renderToStaticMarkup(
      <DesignMetadataProvider captureComponents={['Progress']}>
        <Progress aria-label="Import progress" value={67} />
      </DesignMetadataProvider>,
    );

    expect(designSpec.slots).toEqual({});
    expect(html).toContain('data-design-component="Progress"');
    expect(html).toContain('data-design-capture="true"');
    expect(html).toContain('data-design-key="fill"');
    expect(html).toContain('data-design-layer="fill"');
    expect(html).not.toContain('data-design-slot=');
  });

  describe('position mode', () => {
    it('places one current segment between the steps before and after it', () => {
      expect(progressPositionSegments({ state: 'current', step: 3 }, 7)).toEqual([
        'before',
        'before',
        'current',
        'after',
        'after',
        'after',
        'after',
      ]);
    });

    it('outlines the first step before the start, fills all on completion, ends at the abandon step', () => {
      expect(progressPositionSegments({ state: 'not-started' }, 3)).toEqual([
        'next',
        'after',
        'after',
      ]);
      expect(progressPositionSegments({ state: 'completed' }, 2)).toEqual([
        'completed',
        'completed',
      ]);
      expect(progressPositionSegments({ state: 'abandoned', step: 2 }, 4)).toEqual([
        'ended',
        'ended',
        'after',
        'after',
      ]);
    });

    it('rejects a step outside the workflow instead of clamping it', () => {
      for (const [step, total] of [
        [0, 7],
        [8, 7],
        [1.5, 7],
        [1, 0],
      ] as const) {
        expect(validProgressPosition({ state: 'current', step }, total)).toBe(false);
      }

      expect(validProgressPosition({ state: 'abandoned', step: 8 }, 7)).toBe(false);
      expect(validProgressPosition({ state: 'completed' }, 7)).toBe(true);
      expect(
        renderToStaticMarkup(
          <Progress
            aria-label="Step 9 of 7"
            variant="segmented"
            total={7}
            position={{ state: 'current', step: 9 }}
          />,
        ),
      ).toBe('');
    });

    it('is an image named by its label, with no progress values and no animation', () => {
      const html = renderToStaticMarkup(
        <Progress
          aria-label="Step 3 of 7: Break the solution down"
          variant="segmented"
          total={7}
          position={{ state: 'current', step: 3 }}
        />,
      );
      expect(html).toContain('role="img"');
      expect(html).toContain('aria-label="Step 3 of 7: Break the solution down"');
      expect(html).not.toContain('aria-valuenow');
      expect(html).not.toContain('progressbar');
      expect(html).not.toContain('transition');
      expect(html).toContain('data-progress-representation="position"');
      expect(html.match(/data-progress-segment="before"/g)).toHaveLength(2);
      expect(html.match(/data-progress-segment="current"/g)).toHaveLength(1);
      expect(html.match(/data-progress-segment="after"/g)).toHaveLength(4);
      // 20 px segments, a 40 px current one, shrinking to fit 16rem and never below 4 px.
      expect(html).toContain('max-w-[min(100%,16rem)]');
      expect(html).toMatch(/w-10 bg-status-info/);
      expect(html).toContain('min-w-1');
      expect(html).toContain('h-progress-track');
    });

    it('uses the compact height on request', () => {
      const html = renderToStaticMarkup(
        <Progress
          aria-label="Step 1 of 2"
          variant="segmented"
          size="compact"
          total={2}
          position={{ state: 'current', step: 1 }}
        />,
      );
      expect(html).toContain('h-1');
      expect(html).not.toContain('h-progress-track');
    });
  });
});
