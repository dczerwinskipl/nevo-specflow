import { describe, expect, it } from 'vitest';

import { validateIR } from './schema';

const emptyDesignSystem = {
  kind: 'design-system',
  schemaVersion: 4,
  generatedAt: 'deterministic-fixture',
  source: {
    name: 'Fixture',
    reference: 'fixture',
    route: 'http://localhost/',
    viewport: { width: 1, height: 1, deviceScaleFactor: 1 },
  },
  semantics: {
    componentIdentityAttribute: 'data-design-component',
    slotAttribute: 'data-design-slot',
    note: 'Fixture',
  },
  definitions: [],
  resources: { colors: [], textStyles: [], assets: [] },
  components: {},
} as const;

describe('canonical IR validation', () => {
  it('accepts an empty but structurally valid design-system document', () => {
    expect(() => validateIR(structuredClone(emptyDesignSystem))).not.toThrow();
  });

  it('rejects unsupported schema versions', () => {
    expect(() => validateIR({ ...emptyDesignSystem, schemaVersion: 3 })).toThrow(
      /Unsupported design-system schemaVersion/,
    );
  });

  it('rejects definitions without a matching capture collection', () => {
    expect(() =>
      validateIR({
        ...emptyDesignSystem,
        definitions: [
          {
            component: 'Button',
            order: 1,
            variantProperties: [],
            propertyValues: {},
            slots: {},
          },
        ],
      }),
    ).toThrow(/missing Button/);
  });

  it('requires captures only for explicit profile roots while retaining dependency definitions', () => {
    expect(() =>
      validateIR({
        ...emptyDesignSystem,
        profile: {
          id: 'app',
          owner: 'app',
          displayName: 'Application',
          roots: ['AppControl'],
          resources: 'dependencies',
        },
        definitions: [
          {
            component: 'SharedControl',
            order: 1,
            variantProperties: [],
            propertyValues: {},
            slots: {},
          },
          {
            component: 'AppControl',
            order: 2,
            variantProperties: [],
            propertyValues: {},
            slots: {},
          },
        ],
        components: {
          AppControl: [
            {
              stableId: 'AppControl/',
              sourceId: 'app-control',
              component: 'AppControl',
              properties: {},
              root: {},
              bindings: {},
              slots: {},
            },
          ],
        },
      }),
    ).not.toThrow();
  });

  it('rejects missing and duplicate profile roots', () => {
    const profile = {
      id: 'app',
      owner: 'app',
      displayName: 'Application',
      roots: ['Missing', 'Missing'],
      resources: 'dependencies',
    } as const;

    expect(() => validateIR({ ...emptyDesignSystem, profile })).toThrow(/duplicate values/);
  });
});
