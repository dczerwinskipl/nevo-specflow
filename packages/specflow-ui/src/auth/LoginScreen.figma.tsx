import { defineDesignComponent } from '@nevo/figma-core/authoring';

export const loginScreenDesignSpec = defineDesignComponent({
  component: 'SpecFlowLoginScreen',
  displayName: 'SpecFlow — Login',
  description: 'Standalone SpecFlow authentication screen outside the application shell.',
  target: 'screen',
  order: 210,
  variants: {},
  slots: {
    content: { kind: 'container', required: true },
  },
  figma: {
    root: { width: 1440, height: 960, layoutMode: 'NONE' },
    slots: { content: { x: 500, y: 180, width: 440, height: 600 } },
  },
});
