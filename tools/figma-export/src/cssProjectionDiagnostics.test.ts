import { describe, expect, it } from 'vitest';
import type { ComponentCaptureIR, ComputedStyleRecord } from '@nevo/figma-core/ir';
import {
  collectCssProjectionDiagnostics,
  isSupportedBackgroundImage,
} from './cssProjectionDiagnostics';

function capture(style: ComputedStyleRecord): ComponentCaptureIR {
  return {
    stableId: 'Probe/default',
    sourceId: 'default',
    component: 'Probe',
    properties: {},
    root: { display: 'block', width: '100px', height: '100px', opacity: '1', ...style },
    bindings: {},
    slots: {},
  };
}

describe('CSS projection diagnostics', () => {
  it('accepts only the controlled background gradient subset', () => {
    expect(
      isSupportedBackgroundImage('linear-gradient(90deg, #000 0%, rgba(1, 2, 3, 0) 100%)'),
    ).toBe(true);
    expect(
      isSupportedBackgroundImage(
        'radial-gradient(75% 55% at 12% -12%, #fff 0%, transparent 100%), linear-gradient(#000, #111)',
      ),
    ).toBe(true);
    expect(isSupportedBackgroundImage('url("hero.png")')).toBe(false);
    expect(isSupportedBackgroundImage('conic-gradient(#000, #fff)')).toBe(false);
    expect(isSupportedBackgroundImage('linear-gradient(#000, #fff), url("noise.png")')).toBe(false);
  });

  it.each([
    [{ position: 'sticky' }, 'unsupported-sticky-position'],
    [{ backgroundImage: 'url("hero.png")' }, 'unsupported-background-image'],
    [
      { borderTopWidth: '1px', borderTopStyle: 'dashed', borderTopColor: 'rgb(255, 255, 255)' },
      'unsupported-border-style',
    ],
    [
      { outlineWidth: '2px', outlineStyle: 'solid', outlineColor: 'rgb(59, 130, 246)' },
      'unsupported-outline',
    ],
  ] as const)('reports material unsupported CSS %#', (style, code) => {
    expect(collectCssProjectionDiagnostics({ Probe: [capture(style)] })).toContainEqual(
      expect.objectContaining({ code, component: 'Probe', layer: 'root' }),
    );
  });

  it('ignores invisible effects and supported solid borders', () => {
    const diagnostics = collectCssProjectionDiagnostics({
      Probe: [
        capture({
          display: 'none',
          position: 'sticky',
          backgroundImage: 'url("hero.png")',
          borderTopWidth: '1px',
          borderTopStyle: 'solid',
          borderTopColor: 'rgb(255, 255, 255)',
          outlineWidth: '0px',
          outlineStyle: 'none',
        }),
      ],
    });
    expect(diagnostics).toEqual([]);
  });

  it('deduplicates repeated captures at the component/layer boundary', () => {
    const repeated = capture({ position: 'sticky' });
    expect(collectCssProjectionDiagnostics({ Probe: [repeated, repeated] })).toHaveLength(1);
  });
});

