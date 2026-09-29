import { type HTMLAttributes, type ReactNode } from 'react';
export interface AppBackgroundProps extends HTMLAttributes<HTMLDivElement> {
    brandPrimary?: string;
    designMetadata?: boolean;
}
export declare const AppBackground: import("react").ForwardRefExoticComponent<AppBackgroundProps & import("react").RefAttributes<HTMLDivElement>>;
export interface WorkspaceSurfaceProps extends HTMLAttributes<HTMLElement> {
    as?: 'div' | 'main' | 'section';
    blur?: boolean;
    designMetadata?: boolean;
}
export declare function WorkspaceSurface({ as: Component, blur, className, designMetadata, ...props }: WorkspaceSurfaceProps): import("react/jsx-runtime").JSX.Element;
export interface WorkspaceSurfacePreviewProps {
    children: ReactNode;
    className?: string;
}
export declare function WorkspaceSurfacePreview({ children, className }: WorkspaceSurfacePreviewProps): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=Environment.d.ts.map