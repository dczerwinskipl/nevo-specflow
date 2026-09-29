import { defineDesignComponent } from '@nevo/figma-core/authoring';

export const designSpec = defineDesignComponent({
  component: 'PasswordInput',
  description:
    'Password control composed from the shared InputGroup and TextInput. Visibility uses the shared eye/eye-off icon resources; local presentation state does not participate in form value ownership.',
  order: 118,
  variants: { state: ['default', 'disabled', 'invalid'] },
  defaults: { state: 'default' },
  slots: {
    control: { kind: 'container' },
    visibilityAction: { kind: 'container' },
  },
});



