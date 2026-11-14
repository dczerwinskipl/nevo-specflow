import { describe, expect, it } from 'vitest';
import {
  clampView,
  fitScale,
  fitView,
  maximumScale,
  minimumInlineScale,
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
    expect(fitScale(wide, { width: 600, height: 0 }, 'inline')).toBe(minimumInlineScale);
    expect(fitScale(wide, { width: 1000, height: 400 }, 'window')).toBe(0.5);
    expect(fitScale({ width: 100, height: 100 }, { width: 1000, height: 800 }, 'window')).toBe(1);
  });

  it('clamps the zoom from the fitted scale to 4x and keeps the drawing inside the box', () => {
    const geometry: DiagramGeometry = {
      content: wide,
      box: { width: 600, height: 400 * minimumInlineScale },
      fit: minimumInlineScale,
    };

    expect(clampView({ scale: 0.1, x: 0, y: 0 }, geometry).scale).toBe(minimumInlineScale);
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
});
