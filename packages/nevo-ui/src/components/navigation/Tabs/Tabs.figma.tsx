import { defineDesignComponent } from '@nevo/figma-core/authoring';

export const designSpecs = [
  defineDesignComponent({
    component: 'TabsTrigger',
    description: 'Interactive tab label with selection, focus and disabled states.',
    order: 22,
    variants: {
      selection: ['default', 'selected'],
      state: ['default', 'focus', 'disabled'],
    },
    defaults: { selection: 'default', state: 'default' },
    slots: {
      label: { kind: 'text', propertyName: 'Label', defaultText: 'Overview', required: true },
    },
    bindings: {
      content: {
        property: 'selection',
        values: { default: 'Color/content-muted', selected: 'Color/content-primary' },
      },
    },
  }),
  defineDesignComponent({
    component: 'Tabs',
    description: 'Accessible tablist and associated content composition for switching local views.',
    order: 24,
    variants: {},
    slots: {
      list: { kind: 'slot', propertyName: 'List', required: true },
      content: { kind: 'slot', propertyName: 'Content', required: true },
    },
  }),
] as const;



