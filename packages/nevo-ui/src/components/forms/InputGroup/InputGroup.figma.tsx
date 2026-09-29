import { defineDesignComponent } from '@nevo/figma-core/authoring';

export const designSpec = defineDesignComponent({
  component: 'InputGroup',
  description: 'Compositional control surface for inline addons, controls and actions.',
  order: 18,
  variants: {},
  slots: {
    addon: { kind: 'container', exposeVisibility: true },
    control: { kind: 'slot', propertyName: 'Control', required: true },
    action: { kind: 'container', exposeVisibility: true },
  },
});



