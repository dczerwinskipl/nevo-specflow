import { type HTMLAttributes } from 'react';
import { type VariantProps } from 'tailwind-variants/lite';
export declare const separatorDefaults: {
    readonly orientation: "horizontal";
};
export declare const separatorVariants: import("tailwind-variants/lite").TVReturnType<{
    orientation: {
        horizontal: "h-px w-full";
        vertical: "h-full min-h-4 w-px self-stretch";
    };
}, undefined, "shrink-0 bg-divider", {
    orientation: {
        horizontal: "h-px w-full";
        vertical: "h-full min-h-4 w-px self-stretch";
    };
}, undefined, import("tailwind-variants/lite").TVReturnTypeLike<{
    orientation: {
        horizontal: "h-px w-full";
        vertical: "h-full min-h-4 w-px self-stretch";
    };
}, undefined>>;
export interface SeparatorProps extends Omit<HTMLAttributes<HTMLDivElement>, 'role'>, VariantProps<typeof separatorVariants> {
}
export declare const Separator: import("react").ForwardRefExoticComponent<SeparatorProps & import("react").RefAttributes<HTMLDivElement>>;
//# sourceMappingURL=Separator.d.ts.map