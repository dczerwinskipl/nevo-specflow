export interface FigmaImporterProjectConfig {
  figma: {
    managedPage: { stableId: string; name: string };
    sections: {
      designSystem: { stableId: string; name: string };
      overviews: { stableId: string; name: string };
      screens: { stableId: string; name: string };
    };
    variableCollection: { stableId: string; name: string };
    textStylePrefix: string;
    pluginData: {
      stableId: string;
      managed: string;
      slotSchema: string;
      resourceKind: string;
    };
    resources: {
      fontFamily: string;
      assetColorToken: string;
      textStyleColorToken: string;
    };
  };
}

let activeConfig: FigmaImporterProjectConfig | undefined;

export function configureFigmaImporter(config: FigmaImporterProjectConfig) {
  activeConfig = config;
}

export const figmaProjectConfig = new Proxy({} as FigmaImporterProjectConfig, {
  get(_target, property: keyof FigmaImporterProjectConfig) {
    if (!activeConfig) throw new Error('Figma importer project configuration has not been set');
    return activeConfig[property];
  },
});
