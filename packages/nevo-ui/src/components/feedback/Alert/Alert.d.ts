import { type HTMLAttributes, type ReactNode } from 'react';
import type { StatusTone } from '../../../design-system/statusTone';
import { type IconName } from '../../foundations/Icon';
export declare const alertVariants: import("tailwind-variants/lite").TVReturnType<{
    tone: {
        neutral: "border-border-default bg-surface-subtle";
        info: "border-status-info/30 bg-status-info/5";
        success: "border-status-success/30 bg-status-success/5";
        attention: "border-status-attention/30 bg-status-attention/5";
        danger: "border-status-danger/30 bg-status-danger/5";
    };
}, undefined, "rounded-composite border px-4 py-3", {
    tone: {
        neutral: "border-border-default bg-surface-subtle";
        info: "border-status-info/30 bg-status-info/5";
        success: "border-status-success/30 bg-status-success/5";
        attention: "border-status-attention/30 bg-status-attention/5";
        danger: "border-status-danger/30 bg-status-danger/5";
    };
}, undefined, import("tailwind-variants/lite").TVReturnTypeLike<{
    tone: {
        neutral: "border-border-default bg-surface-subtle";
        info: "border-status-info/30 bg-status-info/5";
        success: "border-status-success/30 bg-status-success/5";
        attention: "border-status-attention/30 bg-status-attention/5";
        danger: "border-status-danger/30 bg-status-danger/5";
    };
}, undefined>>;
export interface AlertProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
    title?: ReactNode;
    actions?: ReactNode;
    /** Override the semantic tone icon. Pass null to intentionally hide it. */
    icon?: IconName | null;
    tone?: StatusTone;
}
export declare const Alert: import("react").ForwardRefExoticComponent<AlertProps & import("react").RefAttributes<HTMLDivElement>>;
//# sourceMappingURL=Alert.d.ts.map