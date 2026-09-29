import { type HTMLAttributes } from 'react';
import { type VariantProps } from 'tailwind-variants/lite';
import type { StatusTone } from '../../../design-system/statusTone';
export declare const statusIndicatorVariants: import("tailwind-variants/lite").TVReturnType<{
    tone: {
        neutral: "bg-content-muted";
        info: "bg-status-info";
        success: "bg-status-success";
        attention: "bg-status-attention";
        danger: "bg-status-danger";
    };
    size: {
        sm: "size-status-indicator-sm";
        md: "size-status-indicator-md";
    };
}, undefined, "inline-block shrink-0 rounded-full", {
    tone: {
        neutral: "bg-content-muted";
        info: "bg-status-info";
        success: "bg-status-success";
        attention: "bg-status-attention";
        danger: "bg-status-danger";
    };
    size: {
        sm: "size-status-indicator-sm";
        md: "size-status-indicator-md";
    };
}, undefined, import("tailwind-variants/lite").TVReturnTypeLike<{
    tone: {
        neutral: "bg-content-muted";
        info: "bg-status-info";
        success: "bg-status-success";
        attention: "bg-status-attention";
        danger: "bg-status-danger";
    };
    size: {
        sm: "size-status-indicator-sm";
        md: "size-status-indicator-md";
    };
}, undefined>>;
export type StatusIndicatorSize = NonNullable<VariantProps<typeof statusIndicatorVariants>['size']>;
type StatusIndicatorAccessibilityProps = {
    decorative?: true;
    'aria-label'?: never;
} | {
    decorative: false;
    'aria-label': string;
};
export type StatusIndicatorProps = Omit<HTMLAttributes<HTMLSpanElement>, 'aria-label' | 'children'> & Pick<VariantProps<typeof statusIndicatorVariants>, 'size'> & StatusIndicatorAccessibilityProps & {
    tone?: StatusTone;
};
export declare const StatusIndicator: import("react").ForwardRefExoticComponent<StatusIndicatorProps & import("react").RefAttributes<HTMLSpanElement>>;
export {};
//# sourceMappingURL=StatusIndicator.d.ts.map