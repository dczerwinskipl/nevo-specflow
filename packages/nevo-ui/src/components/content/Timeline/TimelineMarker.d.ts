import { type VariantProps } from 'tailwind-variants/lite';
import { type IconName } from '../../foundations/Icon';
export declare const timelineMarkerVariants: import("tailwind-variants/lite").TVReturnType<{
    size: {
        sm: "size-4";
        md: "size-5";
    };
    tone: {
        neutral: "text-content-muted";
        info: "text-content-link";
        success: "text-status-success";
        attention: "text-status-attention";
        danger: "text-status-danger";
    };
    active: {
        true: "scale-110";
        false: "";
    };
}, undefined, "relative z-10 flex shrink-0 items-center justify-center transition-transform motion-reduce:transition-none", {
    size: {
        sm: "size-4";
        md: "size-5";
    };
    tone: {
        neutral: "text-content-muted";
        info: "text-content-link";
        success: "text-status-success";
        attention: "text-status-attention";
        danger: "text-status-danger";
    };
    active: {
        true: "scale-110";
        false: "";
    };
}, undefined, import("tailwind-variants/lite").TVReturnTypeLike<{
    size: {
        sm: "size-4";
        md: "size-5";
    };
    tone: {
        neutral: "text-content-muted";
        info: "text-content-link";
        success: "text-status-success";
        attention: "text-status-attention";
        danger: "text-status-danger";
    };
    active: {
        true: "scale-110";
        false: "";
    };
}, undefined>>;
export type TimelineTone = NonNullable<VariantProps<typeof timelineMarkerVariants>['tone']>;
export interface TimelineMarkerProps {
    active?: boolean;
    className?: string;
    icon?: IconName;
    iconClassName?: string;
    tone?: TimelineTone;
}
export declare const TimelineMarker: import("react").ForwardRefExoticComponent<TimelineMarkerProps & import("react").RefAttributes<HTMLSpanElement>>;
//# sourceMappingURL=TimelineMarker.d.ts.map