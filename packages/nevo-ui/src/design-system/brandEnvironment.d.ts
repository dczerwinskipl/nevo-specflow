import type { CSSProperties } from 'react';
export declare const DEFAULT_BRAND_PRIMARY = "#2b6bff";
export declare const appBackgroundClassName = "bg-canvas bg-app-base";
export declare const workspaceSurfaceClassName = "workspace-surface-material relative bg-workspace-material bg-workspace";
export interface BrandEnvironment {
    primary: string;
    actionHover: string;
    focusRing: string;
    actionGlow: string;
    ambientSubtle: string;
    ambientMedium: string;
    ambientDeep: string;
    appBackgroundImage: string;
    workspaceBackgroundImage: string;
}
export type BrandEnvironmentStyle = CSSProperties & {
    '--color-brand-primary': string;
    '--color-action-primary-hover': string;
    '--color-focus-ring': string;
    '--drop-shadow-action-glow': string;
    '--background-image-app-base': string;
    '--background-image-workspace': string;
};
export declare function deriveBrandEnvironment(primary?: string): BrandEnvironment;
export declare function brandEnvironmentStyle(primary?: string): BrandEnvironmentStyle;
export declare function renderBrandEnvironmentCss(primary?: string): string;
//# sourceMappingURL=brandEnvironment.d.ts.map