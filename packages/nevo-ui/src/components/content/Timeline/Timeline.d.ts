import { type OlHTMLAttributes } from 'react';
import { type TimelineSize } from './timelineContract';
export { timelineDefaults, timelineSizes, type TimelineSize } from './timelineContract';
export declare const timelineRootClassName = "m-0 flex min-w-0 list-none flex-col p-0";
export interface TimelineProps extends OlHTMLAttributes<HTMLOListElement> {
    size?: TimelineSize;
}
export declare const Timeline: import("react").ForwardRefExoticComponent<TimelineProps & import("react").RefAttributes<HTMLOListElement>> & {
    Item: import("react").ForwardRefExoticComponent<import("./TimelineItem").TimelineItemProps & import("react").RefAttributes<HTMLLIElement>>;
    Marker: import("react").ForwardRefExoticComponent<import("./TimelineMarker").TimelineMarkerProps & import("react").RefAttributes<HTMLSpanElement>>;
    Content: import("react").ForwardRefExoticComponent<import("./TimelineContent").TimelineContentProps & import("react").RefAttributes<HTMLDivElement>>;
};
//# sourceMappingURL=Timeline.d.ts.map