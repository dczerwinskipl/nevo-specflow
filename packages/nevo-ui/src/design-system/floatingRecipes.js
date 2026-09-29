import { tv } from 'tailwind-variants/lite';
import { fastColorTransitionClassName } from './interactionRecipes';
import { sectionLabelContainerClassName } from './sectionRecipes';
export const floatingSurfaceClassName = 'z-50 overflow-hidden rounded-composite border border-border-default bg-surface-raised text-content-primary shadow-2xl outline-none';
export const floatingContentClassName = `${floatingSurfaceClassName} min-w-48 p-1`;
export const floatingItemDefaults = { state: 'default' };
export const floatingItemVariants = tv({
    base: `relative flex min-h-control-height-compact w-full select-none items-center gap-2 rounded-control px-control-padding-compact py-1.5 text-left text-body-sm text-content-secondary outline-none data-[highlighted]:bg-surface-hover data-[highlighted]:text-content-primary data-[design-prop-state=highlighted]:bg-surface-hover data-[design-prop-state=highlighted]:text-content-primary data-[disabled]:pointer-events-none data-[disabled]:text-content-muted data-[disabled]:opacity-50 ${fastColorTransitionClassName}`,
    variants: {
        state: {
            default: '',
            highlighted: 'bg-surface-hover text-content-primary',
            disabled: 'pointer-events-none text-content-muted opacity-50',
        },
    },
    defaultVariants: floatingItemDefaults,
});
export const floatingLabelClassName = sectionLabelContainerClassName;
export const floatingSeparatorClassName = '-mx-1 my-1 h-px bg-divider';
//# sourceMappingURL=floatingRecipes.js.map