import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Children, cloneElement, isValidElement, } from 'react';
import { designSlot, useDesignMetadata } from '@nevo/figma-core/metadata';
import { cn } from '../../../lib';
import { Link } from '../../actions/Link';
import { Icon } from '../../foundations/Icon';
export function Breadcrumbs({ children, className, label = 'Breadcrumbs', ...props }) {
    const capture = useDesignMetadata('Breadcrumbs');
    const items = Children.toArray(children);
    return (_jsx("nav", { "aria-label": label, className: className, ...props, ...capture, children: _jsx("ol", { className: "flex flex-wrap items-center gap-1 text-body-sm text-content-muted", ...designSlot('Breadcrumbs', 'items'), children: items.map((child, index) => (_jsxs("li", { className: "flex min-w-0 items-center gap-1", children: [isValidElement(child)
                        ? cloneElement(child, {
                            current: index === items.length - 1,
                        })
                        : child, index < items.length - 1 ? (_jsx(Icon, { "aria-hidden": true, name: "chevron-right", size: "sm", className: "text-content-muted" })) : null] }, isValidElement(child) && child.key ? child.key : index))) }) }));
}
export function BreadcrumbItem({ 'aria-current': _ariaCurrent, children, className, current, href, ...props }) {
    const itemClassName = cn('block min-w-0 max-w-full truncate', className);
    if (current) {
        return (_jsx("span", { "aria-current": "page", className: cn(itemClassName, 'text-content-primary'), ...props, children: children }));
    }
    if (href) {
        return (_jsx(Link, { href: href, tone: "muted", className: itemClassName, ...props, children: children }));
    }
    return (_jsx("span", { className: cn(itemClassName, 'text-content-muted'), ...props, children: children }));
}
//# sourceMappingURL=Breadcrumbs.js.map