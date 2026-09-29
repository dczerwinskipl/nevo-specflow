import { type HTMLAttributes } from 'react';
import { type VariantProps } from 'tailwind-variants/lite';
export declare const surfaceDefaults: {
    readonly tone: "default";
};
/**
 * Semantic content surfaces only. Control surfaces stay owned by form controls
 * (`InputGroup`, `TextInput`, Select, etc.) rather than becoming a generic Surface tone.
 */
export declare const surfaceVariants: import("tailwind-variants/lite").TVReturnType<{
    tone: {
        default: "bg-surface";
        raised: "bg-surface-raised";
        subtle: "bg-surface-subtle";
    };
}, undefined, "text-content-primary", {
    tone: {
        default: "bg-surface";
        raised: "bg-surface-raised";
        subtle: "bg-surface-subtle";
    };
}, undefined, import("tailwind-variants/lite").TVReturnTypeLike<{
    tone: {
        default: "bg-surface";
        raised: "bg-surface-raised";
        subtle: "bg-surface-subtle";
    };
}, undefined>>;
export type SurfaceTone = NonNullable<VariantProps<typeof surfaceVariants>['tone']>;
export interface SurfaceProps extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof surfaceVariants> {
}
export declare const Surface: import("react").ForwardRefExoticComponent<SurfaceProps & import("react").RefAttributes<HTMLDivElement>>;
//# sourceMappingURL=Surface.d.ts.map