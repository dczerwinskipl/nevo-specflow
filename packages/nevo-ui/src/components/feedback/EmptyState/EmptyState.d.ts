import { type HTMLAttributes, type ReactNode } from 'react';
import { type IconName } from '../../foundations/Icon';
export interface EmptyStateProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
    title: ReactNode;
    description?: ReactNode;
    icon?: IconName;
    actions?: ReactNode;
}
export declare const EmptyState: import("react").ForwardRefExoticComponent<EmptyStateProps & import("react").RefAttributes<HTMLDivElement>>;
//# sourceMappingURL=EmptyState.d.ts.map