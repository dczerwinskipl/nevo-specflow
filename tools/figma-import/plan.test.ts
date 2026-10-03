import { describe, expect, it } from 'vitest';

import type {
  ComponentCaptureIR,
  DesignSystemIR,
  FigmaComponentDefinition,
  ScreensIR,
} from '@nevo/figma-core/ir';
import {
  buildComponentImportPlan,
  componentReferenceKind,
  designSystemRequirements,
  mainComponentRequirement,
  orderFigmaComponentDefinitionsByDependencies,
  screenRequirements,
  selectCanonicalCaptures,
} from './plan';

const buttonDefinition: FigmaComponentDefinition = {
  component: 'ExampleControl',
  order: 1,
  variantProperties: ['size'],
  propertyValues: { size: ['sm', 'md'] },
  defaultProperties: { size: 'md' },
  slots: { label: { kind: 'text', propertyName: 'Label', defaultText: 'Continue' } },
};

function capture(size: string, canonical?: boolean): ComponentCaptureIR {
  return {
    stableId: `ExampleControl/${size}`,
    sourceId: `${size}-${canonical ? 'canonical' : 'alternate'}`,
    ...(canonical ? { canonical: true } : {}),
    component: 'ExampleControl',
    properties: { size },
    root: {},
    bindings: {},
    slots: {
      label: { kind: 'text', text: 'Continue', style: {}, bindings: {} },
    },
  };
}

describe('pure Figma import plan', () => {
  it('turns canonical component IR into generic axes and slots', () => {
    const plan = buildComponentImportPlan(buttonDefinition, [capture('sm'), capture('md')]);

    expect(plan.setStableId).toBe('ExampleControl/set');
    expect(plan.axes).toEqual([{ name: 'size', values: ['sm', 'md'] }]);
    expect(plan.variants.map((variant) => variant.stableId)).toEqual([
      'ExampleControl/sm',
      'ExampleControl/md',
    ]);
  });

  it('selects explicit canonical content independent of input order', () => {
    expect(
      selectCanonicalCaptures([capture('sm'), capture('sm', true)]).get('ExampleControl/sm')
        ?.canonical,
    ).toBe(true);
  });

  it('orders nested dependencies before their consumers', () => {
    const consumer: FigmaComponentDefinition = {
      ...buttonDefinition,
      component: 'Consumer',
    };
    const captures = {
      ExampleControl: [capture('sm')],
      Consumer: [
        {
          ...capture('sm'),
          stableId: 'Consumer/sm',
          component: 'Consumer',
          structure: [{ componentRef: 'ExampleControl', properties: { size: 'sm' }, slots: {} }],
        },
      ],
    };

    expect(
      orderFigmaComponentDefinitionsByDependencies([consumer, buttonDefinition], captures).map(
        (definition) => definition.component,
      ),
    ).toEqual(['ExampleControl', 'Consumer']);
  });

  it('uses the same reference classification for preflight and import', () => {
    const definitions = new Map([[buttonDefinition.component, buttonDefinition]]);
    const layer = { componentRef: 'ExampleControl', properties: { size: 'sm' }, slots: {} };

    expect(componentReferenceKind('ExampleControl', definitions)).toBe('reusable-component');
    expect(mainComponentRequirement(layer, definitions)).toBe('ExampleControl/sm');
  });

  it('collects reusable component requirements from screen IR', () => {
    const screenDefinition: FigmaComponentDefinition = {
      component: 'ExampleScreen',
      target: 'screen',
      order: 2,
      variantProperties: [],
      propertyValues: {},
      slots: {},
    };
    const screens: ScreensIR = {
      kind: 'screens',
      schemaVersion: 3,
      generatedAt: 'fixture',
      source: {
        name: 'Fixture',
        reference: 'fixture',
        route: 'http://localhost/',
        viewport: { width: 100, height: 100, deviceScaleFactor: 1 },
      },
      semantics: {
        componentIdentityAttribute: 'data-design-component',
        slotAttribute: 'data-design-slot',
        note: 'Fixture',
      },
      definitions: [buttonDefinition, screenDefinition],
      resources: { colors: [], textStyles: [], assets: [] },
      screens: {
        ExampleScreen: [
          {
            ...capture('screen'),
            stableId: 'ExampleScreen/',
            component: 'ExampleScreen',
            properties: {},
            structure: [{ componentRef: 'ExampleControl', properties: { size: 'md' }, slots: {} }],
          },
        ],
      },
    };

    expect(screenRequirements(screens)).toContainEqual({
      stableId: 'ExampleControl/md',
      kind: 'component',
    });
  });

  it('separates app-owned component roots from their Design System dependencies', () => {
    const appDefinition: FigmaComponentDefinition = {
      ...buttonDefinition,
      component: 'AppControl',
      order: 2,
    };
    const appCapture: ComponentCaptureIR = {
      ...capture('md'),
      stableId: 'AppControl/md',
      component: 'AppControl',
      structure: [{ componentRef: 'ExampleControl', properties: { size: 'sm' }, slots: {} }],
    };
    const designSystem: DesignSystemIR = {
      kind: 'design-system',
      schemaVersion: 4,
      generatedAt: 'fixture',
      source: {
        name: 'Fixture',
        reference: 'fixture',
        route: 'http://localhost/',
        viewport: { width: 100, height: 100, deviceScaleFactor: 1 },
      },
      semantics: {
        componentIdentityAttribute: 'data-design-component',
        slotAttribute: 'data-design-slot',
        note: 'Fixture',
      },
      profile: {
        id: 'app',
        owner: 'app',
        displayName: 'App components',
        roots: ['AppControl'],
        resources: 'dependencies',
      },
      definitions: [buttonDefinition, appDefinition],
      resources: { colors: [], textStyles: [], assets: [] },
      components: {
        ExampleControl: [capture('sm')],
        AppControl: [appCapture],
      },
    };

    expect(designSystemRequirements(designSystem)).toEqual([
      { stableId: 'ExampleControl/sm', kind: 'component' },
    ]);
  });

  it('only inspects screen roots selected by the owner profile', () => {
    const dependency = {
      componentRef: 'ExampleControl',
      properties: { size: 'md' },
      slots: {},
    };
    const screens: ScreensIR = {
      kind: 'screens',
      schemaVersion: 3,
      generatedAt: 'fixture',
      source: {
        name: 'Fixture',
        reference: 'fixture',
        route: 'http://localhost/',
        viewport: { width: 100, height: 100, deviceScaleFactor: 1 },
      },
      semantics: {
        componentIdentityAttribute: 'data-design-component',
        slotAttribute: 'data-design-slot',
        note: 'Fixture',
      },
      profile: {
        id: 'app-screens',
        owner: 'app',
        displayName: 'App screens',
        roots: ['OwnedScreen'],
        resources: 'dependencies',
      },
      definitions: [buttonDefinition],
      resources: { colors: [], textStyles: [], assets: [] },
      screens: {
        OwnedScreen: [{ ...capture('owned'), component: 'OwnedScreen', structure: [dependency] }],
        UnownedScreen: [
          {
            ...capture('unowned'),
            component: 'UnownedScreen',
            structure: [{ ...dependency, properties: { size: 'sm' } }],
          },
        ],
      },
    };

    expect(screenRequirements(screens)).toEqual([
      { stableId: 'ExampleControl/md', kind: 'component' },
    ]);
  });
});
