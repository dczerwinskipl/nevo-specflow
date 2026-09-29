import { type HTMLAttributes, type ReactNode } from 'react';
export interface TimelineContentProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
    children?: ReactNode;
    description?: ReactNode;
    meta?: ReactNode;
    time?: ReactNode;
    title: ReactNode;
}
export declare const TimelineContent: import("react").ForwardRefExoticComponent<TimelineContentProps & import("react").RefAttributes<HTMLDivElement>>;
//# sourceMappingURL=TimelineContent.d.ts.map