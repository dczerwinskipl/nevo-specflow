import type { ElementType, HTMLAttributes, ReactNode } from 'react';
import { type TypographyVariant } from '../../../design-system/resources';
export type { TypographyVariant } from '../../../design-system/resources';
export declare const typographyVariantClasses: {
    readonly 'title-lg': "text-title-lg";
    readonly 'title-md': "text-title-md";
    readonly 'title-sm': "text-title-sm";
    readonly 'body-lg': "text-body-lg";
    readonly 'body-md': "text-body-md";
    readonly 'body-sm': "text-body-sm";
    readonly 'label-md': "text-label-md";
    readonly 'label-sm': "text-label-sm";
    readonly 'section-label': "text-section-label uppercase";
    readonly 'code-md': "font-mono text-code-md";
};
export declare const typographyVariants: import("tailwind-variants/lite").TVReturnType<{
    variant: {
        readonly 'title-lg': "text-title-lg";
        readonly 'title-md': "text-title-md";
        readonly 'title-sm': "text-title-sm";
        readonly 'body-lg': "text-body-lg";
        readonly 'body-md': "text-body-md";
        readonly 'body-sm': "text-body-sm";
        readonly 'label-md': "text-label-md";
        readonly 'label-sm': "text-label-sm";
        readonly 'section-label': "text-section-label uppercase";
        readonly 'code-md': "font-mono text-code-md";
    };
}, undefined, "font-sans", {
    variant: {
        readonly 'title-lg': "text-title-lg";
        readonly 'title-md': "text-title-md";
        readonly 'title-sm': "text-title-sm";
        readonly 'body-lg': "text-body-lg";
        readonly 'body-md': "text-body-md";
        readonly 'body-sm': "text-body-sm";
        readonly 'label-md': "text-label-md";
        readonly 'label-sm': "text-label-sm";
        readonly 'section-label': "text-section-label uppercase";
        readonly 'code-md': "font-mono text-code-md";
    };
}, undefined, import("tailwind-variants/lite").TVReturnTypeLike<{
    variant: {
        readonly 'title-lg': "text-title-lg";
        readonly 'title-md': "text-title-md";
        readonly 'title-sm': "text-title-sm";
        readonly 'body-lg': "text-body-lg";
        readonly 'body-md': "text-body-md";
        readonly 'body-sm': "text-body-sm";
        readonly 'label-md': "text-label-md";
        readonly 'label-sm': "text-label-sm";
        readonly 'section-label': "text-section-label uppercase";
        readonly 'code-md': "font-mono text-code-md";
    };
}, undefined>>;
export interface TypographyProps extends HTMLAttributes<HTMLElement> {
    as?: ElementType;
    children?: ReactNode;
    variant?: TypographyVariant;
}
export declare function Typography({ as: Component, children, className, variant, ...props }: TypographyProps): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=Typography.d.ts.map