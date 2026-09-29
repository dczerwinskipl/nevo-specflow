import { type HTMLAttributes, type ReactNode } from 'react';
export interface AppFloatingProviderProps {
    children: ReactNode;
    supported: boolean;
}
export declare function AppFloatingProvider({ children, supported }: AppFloatingProviderProps): import("react/jsx-runtime").JSX.Element;
export type AppFloatingOutletProps = HTMLAttributes<HTMLDivElement>;
export declare function AppFloatingOutlet({ className, ...props }: AppFloatingOutletProps): import("react/jsx-runtime").JSX.Element | null;
export interface AppFloatingRegionProps {
    children: ReactNode;
}
export declare function AppFloatingRegion({ children }: AppFloatingRegionProps): import("react").ReactPortal | null;
//# sourceMappingURL=AppFloating.d.ts.map