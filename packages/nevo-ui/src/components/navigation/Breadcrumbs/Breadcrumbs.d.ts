import { type HTMLAttributes, type ReactNode } from 'react';
export interface BreadcrumbsProps extends HTMLAttributes<HTMLElement> {
    children: ReactNode;
    label?: string;
}
export declare function Breadcrumbs({ children, className, label, ...props }: BreadcrumbsProps): import("react/jsx-runtime").JSX.Element;
export interface BreadcrumbItemProps extends HTMLAttributes<HTMLSpanElement> {
    current?: boolean;
    href?: string;
}
export declare function BreadcrumbItem({ 'aria-current': _ariaCurrent, children, className, current, href, ...props }: BreadcrumbItemProps): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=Breadcrumbs.d.ts.map