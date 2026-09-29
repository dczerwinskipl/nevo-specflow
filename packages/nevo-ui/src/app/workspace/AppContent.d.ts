import { type HTMLAttributes, type PropsWithChildren } from 'react';
export declare function AppContentScrollProvider({ children }: PropsWithChildren): import("react/jsx-runtime").JSX.Element;
export declare function AppContent({ children, className, ...props }: PropsWithChildren<HTMLAttributes<HTMLDivElement>>): import("react/jsx-runtime").JSX.Element;
export declare function AppWorkspaceHeader({ children, className, ...props }: PropsWithChildren<HTMLAttributes<HTMLElement>>): import("react/jsx-runtime").JSX.Element;
export declare function AppWorkspaceBody({ children, className, tabIndex, padding, ...props }: PropsWithChildren<HTMLAttributes<HTMLDivElement> & {
    padding?: 'none' | 'sm' | 'md';
}>): import("react/jsx-runtime").JSX.Element;
export type AppContentContainerSize = 'narrow' | 'standard' | 'wide' | 'xwide' | 'full';
export interface AppContentContainerProps extends HTMLAttributes<HTMLDivElement> {
    align?: 'start' | 'center' | 'end';
    size?: AppContentContainerSize;
}
export declare function AppContentContainer({ align, children, className, size, ...props }: AppContentContainerProps): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=AppContent.d.ts.map