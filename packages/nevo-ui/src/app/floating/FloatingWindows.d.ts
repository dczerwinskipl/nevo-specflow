import { type HTMLAttributes, type ReactNode } from 'react';
import type { IconName } from '../../design-system/resources';
export interface FloatingWindowHostLabels {
    moreWindows: string;
}
export interface FloatingWindowHostProps extends HTMLAttributes<HTMLDivElement> {
    labels?: Partial<FloatingWindowHostLabels>;
    maxVisible?: number;
    /** Icon rendered by the generic overflow hub. */
    overflowIcon?: IconName;
}
export declare function FloatingWindowHost({ children, className, labels: labelsProp, maxVisible, overflowIcon, ...props }: FloatingWindowHostProps): import("react/jsx-runtime").JSX.Element;
export interface FloatingWindowLabels {
    close: string;
    minimize: string;
}
export interface FloatingWindowProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'title'> {
    id: string;
    /** Non-interactive title rendered in header and overflow menu. */
    title: ReactNode;
    children: ReactNode;
    actions?: ReactNode;
    labels?: Partial<FloatingWindowLabels>;
    /** Consumer-controlled unread/activity cue using primary accent. */
    notification?: boolean;
    onClose?: () => void;
}
export declare const FloatingWindow: import("react").ForwardRefExoticComponent<FloatingWindowProps & import("react").RefAttributes<HTMLDivElement>>;
//# sourceMappingURL=FloatingWindows.d.ts.map