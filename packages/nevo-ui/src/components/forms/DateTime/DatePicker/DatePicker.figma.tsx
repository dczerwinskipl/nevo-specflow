import { defineDesignComponent } from '@nevo/figma-core/authoring';

export const designSpec = defineDesignComponent({
  component: 'DatePicker',
  description:
    'Date-only picker. CalendarDate values intentionally carry no time zone. React Aria owns segmented editing and calendar interaction; Nevo UI owns presentation.',
  order: 130,
  variants: { state: ['default', 'disabled', 'invalid'] },
  defaults: { state: 'default' },
  slots: {
    control: { kind: 'container' },
    trigger: { kind: 'container' },
  },
});



