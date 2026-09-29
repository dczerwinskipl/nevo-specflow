import { type AnchorHTMLAttributes } from 'react';
import { type VariantProps } from 'tailwind-variants/lite';
export declare const linkDefaults: {
    readonly tone: "default";
};
export declare const linkVariants: import("tailwind-variants/lite").TVReturnType<{
    tone: {
        default: "text-content-link hover:text-content-link-hover";
        muted: "text-content-secondary hover:text-content-primary";
    };
}, undefined, "cursor-pointer rounded-control-inline underline-offset-2 hover:underline focus-visible:underline transition-colors [transition-duration:var(--motion-duration-fast)] [transition-timing-function:var(--motion-ease-standard)] motion-reduce:transition-none", {
    tone: {
        default: "text-content-link hover:text-content-link-hover";
        muted: "text-content-secondary hover:text-content-primary";
    };
}, undefined, import("tailwind-variants/lite").TVReturnTypeLike<{
    tone: {
        default: "text-content-link hover:text-content-link-hover";
        muted: "text-content-secondary hover:text-content-primary";
    };
}, undefined>>;
export interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement>, VariantProps<typeof linkVariants> {
}
export declare const Link: import("react").ForwardRefExoticComponent<LinkProps & import("react").RefAttributes<HTMLAnchorElement>>;
//# sourceMappingURL=Link.d.ts.map