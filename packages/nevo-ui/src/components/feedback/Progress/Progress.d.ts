import { type HTMLAttributes } from 'react';
type ProgressAccessibilityProps = {
    'aria-label': string;
    'aria-labelledby'?: never;
} | {
    'aria-label'?: never;
    'aria-labelledby': string;
};
export type ProgressProps = Omit<HTMLAttributes<HTMLDivElement>, 'aria-label' | 'aria-labelledby' | 'children'> & ProgressAccessibilityProps & {
    value: number;
    max?: number;
};
export declare function normalizeProgressValue(value: number, max: number): {
    max: number;
    value: number;
    percentage: number;
};
export declare const Progress: import("react").ForwardRefExoticComponent<ProgressProps & import("react").RefAttributes<HTMLDivElement>>;
export {};
//# sourceMappingURL=Progress.d.ts.map