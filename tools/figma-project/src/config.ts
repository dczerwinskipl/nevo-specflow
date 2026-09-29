export const figmaProjectConfig = {
  source: {
    name: 'Nevo SpecFlow frontend',
    reference: 'https://github.com/dczerwinskipl/nevo-specflow',
    route: '/',
  },
  export: {
    host: '127.0.0.1',
    port: 4173,
    captureViewport: { width: 1440, height: 1400, deviceScaleFactor: 1 },
    designOutput: 'generated/design-system.ir.json',
    screensOutput: 'generated/screens.ir.json',
  },
  importer: {
    figma: {
      managedPage: { stableId: 'SpecFlow/managed-page', name: 'Nevo SpecFlow — Managed' },
      sections: {
        designSystem: { stableId: 'SpecFlow/design-system', name: 'Nevo UI — Design System' },
        overviews: { stableId: 'SpecFlow/overviews', name: 'Nevo UI — Component Overviews' },
        screens: { stableId: 'SpecFlow/screens', name: 'Nevo SpecFlow — Screens' },
      },
      variableCollection: { stableId: 'Tokens/colors', name: 'Nevo UI / Semantic colors' },
      textStylePrefix: 'Nevo UI/Typography',
      pluginData: {
        stableId: 'specflowStableId',
        managed: 'specflowManaged',
        slotSchema: 'specflowSlotSchema',
        resourceKind: 'specflowResourceKind',
      },
      resources: {
        fontFamily: 'Inter',
        assetColorToken: 'Color/content-secondary',
        textStyleColorToken: 'Color/content-primary',
      },
    },
  },
} as const;
