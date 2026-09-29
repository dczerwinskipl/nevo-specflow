import { defineDesignComponent } from '@nevo/figma-core/authoring';

export const designSpec = defineDesignComponent({
  component: 'NumberInput',
  description:
    'Locale-aware numeric field powered by React Aria behavior. Nevo owns presentation; React Aria owns parsing, step semantics, clamping, keyboard interaction and floating-point-safe increment/decrement behavior.',
  order: 116,
  variants: {
    state: ['default', 'disabled', 'invalid'],
    steppers: ['shown', 'hidden'],
  },
  defaults: { state: 'default', steppers: 'shown' },
  slots: {
    control: { kind: 'container' },
    input: { kind: 'container' },
    // The steppers axis owns presence; no shared Boolean visibility property
    // should override the geometry of the hidden variants.
    decrementAction: { kind: 'container', exposeVisibility: false },
    incrementAction: { kind: 'container', exposeVisibility: false },
  },
});



