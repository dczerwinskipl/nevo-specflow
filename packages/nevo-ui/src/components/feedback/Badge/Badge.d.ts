import { type HTMLAttributes } from 'react';
import type { StatusTone } from '../../../design-system/statusTone';
export declare const badgeVariants: import("tailwind-variants/lite").TVReturnType<{
    tone: {
        neutral: "border-border-default bg-surface-subtle text-content-secondary";
        info: "border-status-info/30 bg-status-info/10 text-status-info";
        success: "border-status-success/30 bg-status-success/10 text-status-success";
        attention: "border-status-attention/30 bg-status-attention/10 text-status-attention";
        danger: "border-status-danger/30 bg-status-danger/10 text-status-danger";
    };
}, undefined, "inline-flex min-h-5 w-fit items-center rounded-full border px-2 py-0.5 font-sans text-label-sm", {
    tone: {
        neutral: "border-border-default bg-surface-subtle text-content-secondary";
        info: "border-status-info/30 bg-status-info/10 text-status-info";
        success: "border-status-success/30 bg-status-success/10 text-status-success";
        attention: "border-status-attention/30 bg-status-attention/10 text-status-attention";
        danger: "border-status-danger/30 bg-status-danger/10 text-status-danger";
    };
}, undefined, import("tailwind-variants/lite").TVReturnTypeLike<{
    tone: {
        neutral: "border-border-default bg-surface-subtle text-content-secondary";
        info: "border-status-info/30 bg-status-info/10 text-status-info";
        success: "border-status-success/30 bg-status-success/10 text-status-success";
        attention: "border-status-attention/30 bg-status-attention/10 text-status-attention";
        danger: "border-status-danger/30 bg-status-danger/10 text-status-danger";
    };
}, undefined>>;
export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
    tone?: StatusTone;
}
export declare const Badge: import("react").ForwardRefExoticComponent<BadgeProps & import("react").RefAttributes<HTMLSpanElement>>;
//# sourceMappingURL=Badge.d.ts.map