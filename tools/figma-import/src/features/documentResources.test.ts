import { describe, expect, it } from 'vitest';
import type { DesignSystemIR, DesignResources } from '../core/model';
import { colorVariableFor } from './documentResources';

describe('semantic color binding', () => {
  const muted = { id: 'muted-variable' } as Variable;
  const border = { id: 'border-variable' } as Variable;
  const ir = {
    resources: {
      colors: [
        { stableId: 'color/muted', name: 'Muted', value: 'rgb(120, 120, 120)' },
        { stableId: 'color/border', name: 'Border', value: 'rgb(120, 120, 120)' },
      ],
      textStyles: [],
      assets: [],
    },
  } as unknown as DesignSystemIR;
  const resources = {
    colors: new Map([
      ['color/muted', muted],
      ['color/border', border],
    ]),
    textStyles: new Map(),
    assets: new Map(),
  } satisfies DesignResources;

  it('uses the explicit stable identity even when token RGB values are equal', () => {
    expect(colorVariableFor(ir, resources, 'rgb(120, 120, 120)', 'color/border')).toBe(border);
    expect(colorVariableFor(ir, resources, 'rgb(120, 120, 120)', 'color/muted')).toBe(muted);
  });

  it('leaves equal raw CSS color as a literal paint when no semantic ref exists', () => {
    expect(colorVariableFor(ir, resources, 'rgb(120, 120, 120)')).toBeUndefined();
  });
});

