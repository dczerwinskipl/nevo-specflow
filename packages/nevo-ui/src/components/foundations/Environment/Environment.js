import { jsx as _jsx } from "react/jsx-runtime";
import { forwardRef } from 'react';
import { appBackgroundClassName, brandEnvironmentStyle, workspaceSurfaceClassName, } from '../../../design-system/brandEnvironment';
import { useDesignMetadata } from '@nevo/figma-core/metadata';
import { cn } from '../../../lib';
export const AppBackground = forwardRef(function AppBackground({ brandPrimary, className, designMetadata = true, style, ...props }, ref) {
    const metadata = useDesignMetadata('AppBackground', {});
    const capture = designMetadata ? metadata : {};
    return (_jsx("div", { ref: ref, className: cn(appBackgroundClassName, className), style: { ...brandEnvironmentStyle(brandPrimary), ...style }, ...props, ...capture }));
});
export function WorkspaceSurface({ as: Component = 'div', blur = true, className, designMetadata = true, ...props }) {
    const metadata = useDesignMetadata('WorkspaceSurface', {});
    const capture = designMetadata ? metadata : {};
    return (_jsx(Component, { className: cn(workspaceSurfaceClassName, blur && 'backdrop-blur-sm', className), ...props, ...capture }));
}
export function WorkspaceSurfacePreview({ children, className }) {
    return (_jsx(AppBackground, { className: "min-h-screen w-full p-6", children: _jsx(WorkspaceSurface, { className: cn('mx-auto min-h-[20rem] w-full max-w-6xl rounded-surface border border-workspace-edge p-6', className), children: children }) }));
}
//# sourceMappingURL=Environment.js.map