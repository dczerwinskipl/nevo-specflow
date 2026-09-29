import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext } from 'react';
import { tv } from 'tailwind-variants/lite';
import { cn } from '../../lib';
const appWorkspaceBodyVariants = tv({
    base: 'min-h-0 flex-1 overflow-y-auto',
    variants: {
        padding: {
            none: '',
            sm: 'p-3',
            md: 'p-4',
        },
    },
    defaultVariants: {
        padding: 'md',
    },
});
const AppContentScrollContext = createContext(false);
export function AppContentScrollProvider({ children }) {
    return _jsx(AppContentScrollContext.Provider, { value: true, children: children });
}
const appContentContainerVariants = tv({
    base: '@container min-w-0 max-w-full',
    variants: {
        align: {
            start: '',
            center: 'mx-auto',
            end: 'ml-auto',
        },
        size: {
            narrow: 'w-content-narrow',
            standard: 'w-content-standard',
            wide: 'w-content-wide',
            xwide: 'w-content-xwide',
            full: 'w-full',
        },
    },
    defaultVariants: {
        align: 'center',
        size: 'standard',
    },
});
export function AppContent({ children, className, ...props }) {
    const ancestorOwnsScroll = useContext(AppContentScrollContext);
    return (_jsx("div", { className: cn('flex min-w-0 flex-col', ancestorOwnsScroll ? 'min-h-full' : 'h-full', className), ...props, children: children }));
}
export function AppWorkspaceHeader({ children, className, ...props }) {
    return (_jsx("header", { className: cn('flex h-14 shrink-0 items-center justify-between border-b border-border-subtle px-4', className), ...props, children: children }));
}
export function AppWorkspaceBody({ children, className, tabIndex = 0, padding = 'md', ...props }) {
    const ancestorOwnsScroll = useContext(AppContentScrollContext);
    return (_jsx("div", { className: cn(appWorkspaceBodyVariants({ padding }), ancestorOwnsScroll && 'min-h-auto flex-none overflow-visible', className), tabIndex: ancestorOwnsScroll ? undefined : tabIndex, ...props, children: children }));
}
export function AppContentContainer({ align = 'center', children, className, size = 'standard', ...props }) {
    return (_jsx("div", { className: cn(appContentContainerVariants({ align, size }), className), ...props, children: children }));
}
//# sourceMappingURL=AppContent.js.map