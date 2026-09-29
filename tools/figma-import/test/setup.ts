import { configureFigmaImporter } from '../config';

configureFigmaImporter({
  figma: {
    managedPage: { stableId: 'test/page', name: 'Test' },
    sections: {
      designSystem: { stableId: 'test/design-system', name: 'Design System' },
      overviews: { stableId: 'test/overviews', name: 'Overviews' },
      screens: { stableId: 'test/screens', name: 'Screens' },
    },
    variableCollection: { stableId: 'test/colors', name: 'Colors' },
    textStylePrefix: 'Test/',
    pluginData: {
      stableId: 'testStableId',
      managed: 'testManaged',
      slotSchema: 'testSlotSchema',
      resourceKind: 'testResourceKind',
    },
    resources: {
      fontFamily: 'Inter',
      assetColorToken: 'color.foreground',
      textStyleColorToken: 'color.foreground',
    },
  },
});
