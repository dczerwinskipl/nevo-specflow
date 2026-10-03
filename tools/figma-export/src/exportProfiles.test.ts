import type { FigmaComponentDefinition } from '@nevo/figma-core/ir';
import { describe, expect, it } from 'vitest';
import { selectExportProfileRoots } from './exportProfiles';

function definition(
  component: string,
  target?: FigmaComponentDefinition['target'],
): FigmaComponentDefinition {
  return {
    component,
    target,
    order: 1,
    variantProperties: [],
    propertyValues: {},
    slots: {},
  };
}

describe('Figma export profiles', () => {
  it('keeps dependency definitions available but emits only explicit owner roots', () => {
    const definitions = [
      definition('SharedButton'),
      definition('AppPattern'),
      definition('AppScreen', 'screen'),
    ];

    const selected = selectExportProfileRoots(definitions, {
      id: 'application',
      roots: ['AppPattern', 'AppScreen'],
    });

    expect(selected.componentRoots.map((item) => item.component)).toEqual(['AppPattern']);
    expect(selected.screenRoots.map((item) => item.component)).toEqual(['AppScreen']);
  });
});
