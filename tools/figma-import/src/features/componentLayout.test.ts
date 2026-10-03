import { describe, expect, it } from 'vitest';
import type { FigmaComponentDefinition } from '../core/model';
import {
  applyAutoLayout,
  applyChildPlacement,
  componentDisplayName,
  layoutSizingForChild,
  stableIdForProperties,
} from './componentLayout';

describe('CSS layout projection', () => {
  it('separates a human-facing name from the persisted component identity', () => {
    const spec = {
      component: 'SideNavigation',
      displayName: 'SideNavigation',
      variantProperties: [],
    } as unknown as FigmaComponentDefinition;

    expect(componentDisplayName(spec)).toBe('SideNavigation');
    expect(stableIdForProperties(spec, {})).toBe('SideNavigation/');
    expect(componentDisplayName({ component: 'LegacyControl' })).toBe('LegacyControl');
  });

  it('uses free positioning for measured two-dimensional Grid geometry', () => {
    const node = {} as FrameNode;
    applyAutoLayout(node, { display: 'grid', layoutProjection: 'measured' });
    expect(node.layoutMode).toBe('NONE');
  });

  it('honors the exporter flow classification for a block inline formatting context', () => {
    const node = {} as FrameNode;
    applyAutoLayout(node, { display: 'block', flowDirection: 'horizontal' });
    expect(node.layoutMode).toBe('HORIZONTAL');
  });

  it('maps CSS table-cell vertical alignment onto the Auto Layout primary axis', () => {
    const node = {} as FrameNode;
    applyAutoLayout(node, {
      display: 'table-cell',
      flowDirection: 'vertical',
      verticalAlign: 'middle',
    });
    expect(node.layoutMode).toBe('VERTICAL');
    expect(node.primaryAxisAlignItems).toBe('CENTER');
  });

  it('falls back from Hug to fixed for free-positioned measured frames', () => {
    expect(layoutSizingForChild('hug', 'NONE', 'VERTICAL')).toBe('FIXED');
    expect(layoutSizingForChild('hug', 'VERTICAL', 'VERTICAL')).toBe('HUG');
    expect(layoutSizingForChild('fill', 'NONE', 'VERTICAL')).toBe('FILL');
    expect(layoutSizingForChild('fill', 'VERTICAL', 'NONE')).toBe('FIXED');
  });

  it('supports a simple absolute direct child of an Auto Layout frame', () => {
    const node = { x: 0, y: 0, width: 20, height: 10 } as TextNode;
    const parent = { layoutMode: 'VERTICAL', width: 200, height: 100 } as FrameNode;
    applyChildPlacement(node, parent, {
      position: 'absolute',
      left: '12px',
      top: '8px',
    });
    expect(node).toMatchObject({
      layoutPositioning: 'ABSOLUTE',
      x: 12,
      y: 8,
      constraints: { horizontal: 'MIN', vertical: 'MIN' },
    });
  });
});
