import { type ButtonHTMLAttributes } from 'react';
import { type VariantProps } from 'tailwind-variants/lite';
import { type IconName } from '../../foundations/Icon';
export declare const buttonDefaults: {
    readonly variant: "primary";
    readonly size: "md";
};
export declare const buttonVariants: import("tailwind-variants/lite").TVReturnType<{
    variant: {
        primary: "border-transparent bg-action-primary text-content-on-primary hover:bg-action-primary-hover";
        secondary: "border-border-default bg-action-secondary text-content-secondary hover:border-border-strong hover:bg-action-secondary-hover hover:text-content-primary";
        ghost: "border-transparent bg-transparent text-content-muted hover:bg-surface-hover hover:text-content-primary";
        destructive: "border-action-danger/40 bg-transparent text-action-danger hover:border-action-danger/60 hover:bg-action-danger-subtle";
    };
    size: {
        sm: "h-control-height-compact gap-1.5 rounded-control px-control-padding-compact";
        md: "h-control-height-default gap-2 rounded-control px-control-padding-default";
    };
}, undefined, "inline-flex w-fit cursor-pointer items-center justify-center whitespace-nowrap border border-solid disabled:pointer-events-none disabled:opacity-50 transition-colors [transition-duration:var(--motion-duration-fast)] [transition-timing-function:var(--motion-ease-standard)] motion-reduce:transition-none", {
    variant: {
        primary: "border-transparent bg-action-primary text-content-on-primary hover:bg-action-primary-hover";
        secondary: "border-border-default bg-action-secondary text-content-secondary hover:border-border-strong hover:bg-action-secondary-hover hover:text-content-primary";
        ghost: "border-transparent bg-transparent text-content-muted hover:bg-surface-hover hover:text-content-primary";
        destructive: "border-action-danger/40 bg-transparent text-action-danger hover:border-action-danger/60 hover:bg-action-danger-subtle";
    };
    size: {
        sm: "h-control-height-compact gap-1.5 rounded-control px-control-padding-compact";
        md: "h-control-height-default gap-2 rounded-control px-control-padding-default";
    };
}, undefined, import("tailwind-variants/lite").TVReturnTypeLike<{
    variant: {
        primary: "border-transparent bg-action-primary text-content-on-primary hover:bg-action-primary-hover";
        secondary: "border-border-default bg-action-secondary text-content-secondary hover:border-border-strong hover:bg-action-secondary-hover hover:text-content-primary";
        ghost: "border-transparent bg-transparent text-content-muted hover:bg-surface-hover hover:text-content-primary";
        destructive: "border-action-danger/40 bg-transparent text-action-danger hover:border-action-danger/60 hover:bg-action-danger-subtle";
    };
    size: {
        sm: "h-control-height-compact gap-1.5 rounded-control px-control-padding-compact";
        md: "h-control-height-default gap-2 rounded-control px-control-padding-default";
    };
}, undefined>>;
export type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>['variant']>;
export type ButtonSize = NonNullable<VariantProps<typeof buttonVariants>['size']>;
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
    leadingIcon?: IconName;
    trailingIcon?: IconName;
}
export declare const Button: import("react").ForwardRefExoticComponent<ButtonProps & import("react").RefAttributes<HTMLButtonElement>>;
//# sourceMappingURL=Button.d.ts.map