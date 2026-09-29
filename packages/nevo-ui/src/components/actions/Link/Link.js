import { jsx as _jsx } from "react/jsx-runtime";
import { forwardRef } from 'react';
import { tv } from 'tailwind-variants/lite';
import { designSlot, useDesignMetadata } from '@nevo/figma-core/metadata';
import { fastColorTransitionClassName } from '../../../design-system/interactionRecipes';
import { cn } from '../../../lib';
export const linkDefaults = { tone: 'default' };
export const linkVariants = tv({
    base: `cursor-pointer rounded-control-inline underline-offset-2 hover:underline focus-visible:underline ${fastColorTransitionClassName}`,
    variants: {
        tone: {
            default: 'text-content-link hover:text-content-link-hover',
            muted: 'text-content-secondary hover:text-content-primary',
        },
    },
    defaultVariants: linkDefaults,
});
export const Link = forwardRef(function Link({ children, className, tone = linkDefaults.tone, ...props }, ref) {
    const capture = useDesignMetadata('Link', { tone });
    return (_jsx("a", { ref: ref, className: cn(linkVariants({ tone }), className), ...props, ...capture, children: _jsx("span", { ...designSlot('Link', 'label'), children: children }) }));
});
//# sourceMappingURL=Link.js.map