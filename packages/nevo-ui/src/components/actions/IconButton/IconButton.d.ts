import { type ButtonHTMLAttributes } from 'react';
import { type VariantProps } from 'tailwind-variants/lite';
import { type IconName } from '../../foundations/Icon';
export declare const iconButtonDefaults: {
    readonly variant: "ghost";
    readonly size: "md";
};
export declare const iconButtonVariants: import("tailwind-variants/lite").TVReturnType<{
    variant: {
        primary: "border-transparent bg-action-primary text-content-on-primary hover:bg-action-primary-hover";
        secondary: "border-border-default bg-action-secondary text-content-secondary hover:border-border-strong hover:bg-action-secondary-hover hover:text-content-primary";
        ghost: "border-transparent bg-transparent text-content-muted hover:bg-surface-hover hover:text-content-primary";
        destructive: "border-action-danger/40 bg-transparent text-action-danger hover:border-action-danger/60 hover:bg-action-danger-subtle";
    };
    size: {
        xs: "size-control-height-inline rounded-control-inline";
        sm: "size-control-height-compact rounded-control";
        md: "size-control-height-default rounded-control";
    };
}, undefined, "inline-flex shrink-0 cursor-pointer items-center justify-center border border-solid disabled:pointer-events-none disabled:opacity-50 transition-colors [transition-duration:var(--motion-duration-fast)] [transition-timing-function:var(--motion-ease-standard)] motion-reduce:transition-none", {
    variant: {
        primary: "border-transparent bg-action-primary text-content-on-primary hover:bg-action-primary-hover";
        secondary: "border-border-default bg-action-secondary text-content-secondary hover:border-border-strong hover:bg-action-secondary-hover hover:text-content-primary";
        ghost: "border-transparent bg-transparent text-content-muted hover:bg-surface-hover hover:text-content-primary";
        destructive: "border-action-danger/40 bg-transparent text-action-danger hover:border-action-danger/60 hover:bg-action-danger-subtle";
    };
    size: {
        xs: "size-control-height-inline rounded-control-inline";
        sm: "size-control-height-compact rounded-control";
        md: "size-control-height-default rounded-control";
    };
}, undefined, import("tailwind-variants/lite").TVReturnTypeLike<{
    variant: {
        primary: "border-transparent bg-action-primary text-content-on-primary hover:bg-action-primary-hover";
        secondary: "border-border-default bg-action-secondary text-content-secondary hover:border-border-strong hover:bg-action-secondary-hover hover:text-content-primary";
        ghost: "border-transparent bg-transparent text-content-muted hover:bg-surface-hover hover:text-content-primary";
        destructive: "border-action-danger/40 bg-transparent text-action-danger hover:border-action-danger/60 hover:bg-action-danger-subtle";
    };
    size: {
        xs: "size-control-height-inline rounded-control-inline";
        sm: "size-control-height-compact rounded-control";
        md: "size-control-height-default rounded-control";
    };
}, undefined>>;
export type IconButtonVariant = NonNullable<VariantProps<typeof iconButtonVariants>['variant']>;
export type IconButtonSize = NonNullable<VariantProps<typeof iconButtonVariants>['size']>;
export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'children'>, VariantProps<typeof iconButtonVariants> {
    'aria-label': string;
    icon: IconName;
}
export declare const IconButton: import("react").ForwardRefExoticComponent<IconButtonProps & import("react").RefAttributes<HTMLButtonElement>>;
//# sourceMappingURL=IconButton.d.ts.map