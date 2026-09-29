import { defineDesignComponent } from '@nevo/figma-core/authoring';

export const designSpec = defineDesignComponent({
  component: 'DateTimePicker',
  description:
    'Time-zone-aware date and time picker backed by ZonedDateTime. The picker surface contains both calendar and explicit time selection; defaultTimeZone only seeds empty values.',
  order: 136,
  variants: { state: ['default', 'disabled', 'invalid'] },
  defaults: { state: 'default' },
  slots: {
    control: { kind: 'container' },
    trigger: { kind: 'container' },
  },
});



