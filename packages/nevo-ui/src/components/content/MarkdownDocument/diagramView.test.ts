import { describe, expect, it } from 'vitest';
import {
  clampView,
  fitScale,
  fitView,
  maximumScale,
  minimumReadableScale,
  naturalSize,
  panStep,
  viewForKey,
  zoomAt,
  type DiagramGeometry,
} from './diagramView';

const wide = { width: 2000, height: 400 };

describe('diagram view', () => {
  it('opens a diagram fitted to the column, never below 10 px text and never enlarged', () => {
    expect(fitScale({ width: 400, height: 300 }, { width: 600, height: 0 }, 'inline')).toBe(1);
    expect(fitScale({ width: 800, height: 300 }, { width: 600, height: 0 }, 'inline')).toBe(0.75);
    expect(fitScale(wide, { width: 600, height: 0 }, 'inline')).toBe(minimumReadableScale);
    // Full screen fits the whole drawing too, but never below 10 px text either.
    expect(fitScale(wide, { width: 1800, height: 900 }, 'window')).toBe(0.9);
    expect(fitScale(wide, { width: 1000, height: 400 }, 'window')).toBe(minimumReadableScale);
    expect(fitScale({ width: 100, height: 100 }, { width: 1000, height: 800 }, 'window')).toBe(1);
  });

  it('clamps the zoom from the fitted scale to 4x and keeps the drawing inside the box', () => {
    const geometry: DiagramGeometry = {
      content: wide,
      box: { width: 600, height: 400 * minimumReadableScale },
      fit: minimumReadableScale,
    };

    expect(clampView({ scale: 0.1, x: 0, y: 0 }, geometry).scale).toBe(minimumReadableScale);
    expect(clampView({ scale: 9, x: 0, y: 0 }, geometry).scale).toBe(maximumScale);
    // Wider than the box: no gap at either end.
    expect(clampView({ scale: 1, x: 50, y: 0 }, geometry).x).toBe(0);
    expect(clampView({ scale: 1, x: -5000, y: 0 }, geometry).x).toBe(600 - 2000);
    // Smaller than the box on an axis: centred.
    const small: DiagramGeometry = {
      content: { width: 200, height: 100 },
      box: { width: 600, height: 100 },
      fit: 1,
    };
    expect(fitView(small)).toEqual({ scale: 1, x: 200, y: 0 });
  });

  it('zooms about a point, which stays on the same spot of the drawing', () => {
    const geometry: DiagramGeometry = { content: wide, box: { width: 600, height: 300 }, fit: 0.3 };
    const view = zoomAt({ scale: 1, x: -400, y: -50 }, 2, { x: 300, y: 150 }, geometry);

    expect(view.scale).toBe(2);
    // The drawing point under (300, 150) was (700, 200) before and is still under it after.
    expect((300 - view.x) / view.scale).toBe(700);
    expect((150 - view.y) / view.scale).toBe(200);
  });

  it('answers the keyboard: + and - zoom, arrows pan, 0 resets, other keys are ignored', () => {
    const geometry: DiagramGeometry = { content: wide, box: { width: 600, height: 300 }, fit: 0.3 };
    const start = { scale: 1, x: -400, y: -50 };

    expect((viewForKey('+', start, geometry) as { scale: number }).scale).toBe(1.25);
    expect((viewForKey('-', start, geometry) as { scale: number }).scale).toBe(0.8);
    expect(viewForKey('ArrowRight', start, geometry)).toEqual({ ...start, x: -400 - panStep });
    expect(viewForKey('ArrowUp', start, geometry)).toEqual({ ...start, y: -50 + panStep });
    // Never past the drawing's edge.
    expect(viewForKey('ArrowLeft', { ...start, x: -10 }, geometry)).toEqual({ ...start, x: 0 });
    expect(viewForKey('0', start, geometry)).toBe('reset');
    expect(viewForKey('a', start, geometry)).toBeUndefined();
  });

  it('reads the natural size from the viewBox', () => {
    expect(naturalSize('<svg id="d" width="100%" viewBox="-8 -8 2282 442.5">')).toEqual({
      width: 2282,
      height: 442.5,
    });
    expect(naturalSize('<svg>')).toEqual({ width: 0, height: 0 });
  });

  it('opens a very wide diagram readable and pans it sideways, inline and full screen', () => {
    const content = { width: 4000, height: 300 };
    const inline = fitScale(content, { width: 600, height: 0 }, 'inline');
    const inlineGeometry = { content, box: { width: 600, height: 300 * inline }, fit: inline };
    const start = fitView(inlineGeometry);

    expect(inline).toBe(minimumReadableScale);
    // The inline box is as tall as the drawing at that scale; the start shows its left end.
    expect(start).toEqual({ scale: minimumReadableScale, x: 0, y: 0 });
    expect(clampView({ ...start, x: -1e6 }, inlineGeometry).x).toBeCloseTo(600 - 4000 * inline);

    const window = fitScale(content, { width: 1382, height: 838 }, 'window');
    const windowGeometry = { content, box: { width: 1382, height: 838 }, fit: window };

    expect(window).toBe(minimumReadableScale);
    // Full screen: vertically centred in the window, the left end first.
    expect(fitView(windowGeometry)).toEqual({
      scale: window,
      x: 0,
      y: (838 - 300 * window) / 2,
    });
  });

  it('opens a very tall diagram at its natural width and as tall as it is inline; full screen pans it', () => {
    const content = { width: 300, height: 4000 };
    const inline = fitScale(content, { width: 600, height: 0 }, 'inline');
    const inlineGeometry = { content, box: { width: 600, height: 4000 * inline }, fit: inline };

    // It fits the column, so it keeps its natural size and the page scrolls through it.
    expect(inline).toBe(1);
    expect(inlineGeometry.box.height).toBe(4000);
    expect(fitView(inlineGeometry)).toEqual({ scale: 1, x: 150, y: 0 });
    expect(clampView({ scale: 1, x: 150, y: -500 }, inlineGeometry).y).toBe(0);

    // Full screen on a phone: not shrunk to fit the height; it pans down from the top.
    const box = { width: 327, height: 650 };
    const window = fitScale(content, box, 'window');
    const windowGeometry = { content, box, fit: window };

    expect(window).toBe(minimumReadableScale);
    expect(fitView(windowGeometry)).toEqual({ scale: window, x: (327 - 300 * window) / 2, y: 0 });
    expect(clampView({ scale: window, x: 0, y: -1e6 }, windowGeometry).y).toBeCloseTo(
      650 - 4000 * window,
    );
  });

  it('Fit returns to the start view after zooming and panning', () => {
    const geometry = { content: wide, box: { width: 600, height: 300 }, fit: minimumReadableScale };
    const start = fitView(geometry);
    const moved = viewForKey(
      'ArrowRight',
      zoomAt(start, 2, { x: 300, y: 150 }, geometry),
      geometry,
    );

    expect(moved).not.toEqual(start);
    expect(viewForKey('0', start, geometry)).toBe('reset');
    expect(fitView(geometry)).toEqual(start);
  });
});
